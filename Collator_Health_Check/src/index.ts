import { startTelemetryClient, nodeBlockInfoSubject } from './telemetry';
import { notify } from './notifier';
import { NodeBlockInfo } from "./telemetry/connection";
const { providePolkadotApi } = require('./polkadot')
const { makeBackup, makeValidator, getChallenge, isValidator } = require('./server')

const telemetryTimeout = 20000; // in ms

export type NodeState = {
  // sessionKey: string,
  // account?: string,
  block?: number,
  nodeName?: string,
  active?: boolean,
  url?: string,
  challenge?: string
}

/**
 * This microservice should every X minutes to check and, if necessary,
 * perfom a failover routine for our nodes
 */
exports.handler = async () => {

  try {
    console.log('Get ENV variables')
    // TELEMETRY_URL
    // your private telemetry url, defaults to public telemetry url

    // NETWORK_NAME
    // The network (parachain) name
    const networkName = process.env.NETWORK_NAME;
    if (!networkName) {
      console.error("No network name provided in env")
      return
    }

    // FORCE_FAIL
    // IF set to true, the service will perform a failover even if the active node is healthy (used for testing)
    const forceFail = process.env.FORCE_FAIL === 'true'

    // BLOCK_LAG_THRESHOLD
    // If a node's current imported block is more than blockLagThreshold blocks behind that current height, then perform failover 
    const blockLagThreshold = process.env.BLOCK_LAG_THRESHOLD ? +process.env.BLOCK_LAG_THRESHOLD : 20;

    // NODE_NETWORK_IDS
    // telemetry network IDs of our nodes separated by comma
    // the order of the IDs is also the order of preference as backup nodes, i.e. 1st, 2nd, etc.
    const nodeNetworkIDs = process.env.NODE_NETWORK_IDS ? process.env.NODE_NETWORK_IDS.split(',') : []

    // SESSION_KEYS
    // the node session keys of our nodes separated by comma, in the same order (this is not needed since the failover is not done on chain)
    // const sessionKeys = process.env.SESSION_KEYS ? process.env.SESSION_KEYS.split(',') : []
    // URLs
    // node ips or http urles
    const nodeURLs = process.env.NODE_URLS ? process.env.NODE_URLS.split(',') : []
    if (nodeNetworkIDs.length == 0 || nodeURLs.length != nodeNetworkIDs.length) {
      console.error('Check the provided network ids and node urls')
      return
    }

    console.log('Prepare node state data structure')
    const nodeState: {
      [key: string]: NodeState
    } = {};
    for (let i = 0; i < nodeNetworkIDs.length; i++) {
      nodeState[nodeNetworkIDs[i]] = {
        // sessionKey: sessionKeys[i],
        url: nodeURLs[i]
      }
    }

    console.log(`Connect to ${process.env.NETWORK_NAME} network`)
    const polkadotApi = await providePolkadotApi();
    await polkadotApi.isReady;
    // Necessary hack to allow polkadotApi to finish its internal metadata loading
    // apiPromise.isReady unfortunately doesn't wait for those properly
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });

    console.log('Get current block number of each one of our nodes from telemetry')
    // Note that, the private telemetry keeps a record of deactivated or stalled nodes;
    // therefore, we will get block numbers even for nodes that have "disconnected" or shut down.
    // If, however, the telemetry server was reset, the disconnected nodes will not show.
    let timedOut = false;
    let nodeCount = 0;
    await new Promise(async (resolve, reject) => {
      startTelemetryClient()
      let lastAddedNodeTime: number;
      nodeBlockInfoSubject.subscribe((data: NodeBlockInfo) => {
        //console.log(data)
        if (nodeState[data.networkID] && !isNaN(data.block)) {
          nodeState[data.networkID].block = data.block
          nodeState[data.networkID].nodeName = data.nodeName
        }
        lastAddedNodeTime = +new Date()
        nodeCount++
      })
      // wait until there is no more data for at least two seconds, then resolve
      const timeout = setTimeout(() => {
        timedOut = true;
        reject()
      }, telemetryTimeout)
      const intervalID = setInterval(() => {
        if (lastAddedNodeTime && (+ new Date()) - lastAddedNodeTime > 2000) {
          console.log('Finished getting node data from telemetry')
          clearTimeout(timeout);
          clearInterval(intervalID);
          resolve(true);
        }
      }, 200)
    });

    if (timedOut || nodeCount == 0) {
      console.error('Telemetry connection timed out or zero nodes found');
      await notify('Telemetry timed out or 0 nodes');
      return
    }

    console.log('Get current block height from chain')
    const lastHeader = await polkadotApi.rpc.chain.getHeader();
    const chainBlockHeight = +lastHeader.number;
    if (isNaN(chainBlockHeight)) {
      console.error(`Block height not a number: ${chainBlockHeight}`)
      await notify('Blockheight nNaN')
      return;
    }
    console.log(`Current chain block height is ${chainBlockHeight}`)

    console.log('Identify best backup node')
    // we find the highest priority, non-active (not associated), healthy backup node
    let firstHealthyBackupNode: NodeState | undefined;
    for (const networkID of nodeNetworkIDs) {
      const node = nodeState[networkID]
      if (!node) {
        continue
      }
      node.challenge = await getChallenge(node.url, networkName)
      if (!node.challenge) {
        console.log(`Did not provide a valid challenge code: ${node.nodeName}`)
        continue
      }
      if (node.block && node.block >= chainBlockHeight - blockLagThreshold && !node.active && !firstHealthyBackupNode) {
        firstHealthyBackupNode = node
      }
    }
    if (!firstHealthyBackupNode) {
      console.error('Could not find a healthy backup node')
      await notify('No healthy backup')
      return;
    }
    console.log(`Selected backup node is ${firstHealthyBackupNode.nodeName}`)


    console.log('Identify which node is actively validating by querying every server')
    let activeNodeCount = 0
    // Query every server and record backup/validator status
    for (let i = 0; i < nodeURLs.length; i++) {
      const nodeURL = nodeURLs[i]
      try {
        nodeState[nodeNetworkIDs[i]].active = await isValidator(nodeURL, networkName)
        if (nodeState[nodeNetworkIDs[i]].active) {
          activeNodeCount++
        }
        // code snippet to get associated account (not needed in the current implementation, maybe needed for future on-chain failover)
        // const sessionOwner = await polkadotApi.query.session.keyOwner(['aura', sessionKeys[i]])
        // const account = sessionOwner && sessionOwner.toString() ? sessionOwner.toString() : undefined;
        // nodeState[nodeNetworkIDs[i]].account = account
      } catch { } // ignore timeout errors (node may be offline)
    }
    console.log({ nodeState })
    if (activeNodeCount > 1) {
      console.log('More than 1 validator nodes detected')
      await notify('More than 1 validator nodes detected');
      // Consider how you want to handle this scenario; i.e. ignore it? switch the extra nodes to backup?
      // During the initial deployment of this service, it may be better to attend to this case manually for 2 reasons:
      // 1) Running 2 or more validators with the same session key may degrade network performance/speed but does not have any other major shortcomings.
      //    Therefore, it may be "ok" to run 2 nodes in these networks for a short period of time.
      //    Note that there are exceptions to this (e.g. Moonbeam) where 2 nodes may result in bad blocks due to the EVM consensus.
      // 2) On the other hand, the risk of mistakenly setting all nodes to backup will result to 0 blocks and must be minimized.
    }

    if (activeNodeCount == 0) {
          const res = await makeValidator(firstHealthyBackupNode.url, networkName, firstHealthyBackupNode.challenge)
          console.log(`Failover completed:\n${JSON.stringify(res)}`)
          await notify(`Failover completed`)
          return
    }

    console.log('Compare block heights')
    for (const networkID in nodeState) {
      const node = nodeState[networkID]
      console.log(`${node.nodeName} block ${node.block} vs ${chainBlockHeight}`)
      // if the node is not found on telemetry (node went down, and telemetry server was reset)
      // or, if the node is lagging behind in blocks more than the set threshold
      if (forceFail || !node.block || (node.block < chainBlockHeight - blockLagThreshold)) {
        if (node.active) {
          console.log('Active node not found on telemetry or is lagging. Will request another node to validate')
          // ask bad node to stop validating (may be offline, so ignore error)
          // do't wait for HTTP call to complete, as node may be unreachable; ignore errors
          makeBackup(node.url, networkName, node.challenge).then(() => { }).catch(() => { })

          // ask backup node to become validator
          const res = await makeValidator(firstHealthyBackupNode.url, networkName, firstHealthyBackupNode.challenge)
          console.log(`Failover completed:\n${JSON.stringify(res)}`)
          await notify(`Failover completed`)
          break

        } else {
          console.log('Node not found on telemetry or is lagging.')
          await notify('Node not found on telemetry or is lagging')
        }
      }
    }

  } catch (e) {
    console.error(e)
    await notify(`Error in ${process.env.NETWORK_NAME} failover lambda`)
  }

  console.log('Finished')
}

