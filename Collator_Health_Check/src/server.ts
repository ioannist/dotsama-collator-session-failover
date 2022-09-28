const axios = require('axios').default;
const { encryptPayload, decryptMessage } = require('./kms')

export async function makeBackup(nodeURL: string, networkName: string, challenge: string) {
    const blobBackup = await encryptPayload({
        networkName,
        backup: true,
        challenge
    })
    const backupResponse = await axios.post(`http://${nodeURL}/failover?networkName=${networkName}`, {
        networkName,
        blob: blobBackup
    })
    return backupResponse.body;
}

export async function makeValidator(nodeURL: string, networkName: string, challenge: string) {
    // ask backup node to become validator
    const blobValidator = await encryptPayload({
        networkName,
        validate: true,
        challenge
    })
    const validateResponse = await axios.post(`http://${nodeURL}/failover?networkName=${networkName}`, {
        networkName,
        blob: blobValidator
    })
    return validateResponse.body
}

export async function getChallenge(nodeURL: string, networkName: string) {
    const { status, data } = await axios.get(`http://${nodeURL}/challenge?networkName=${networkName}`);
    return data?.challenge
}

export async function isValidator(nodeURL: string, networkName: string) {
    const { status, data } = await axios.get(`http://${nodeURL}/is-validator?networkName=${networkName}`);
    return data?.info === 'true'
}

