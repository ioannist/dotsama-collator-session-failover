const { ApiPromise, WsProvider, Keyring } = require("@polkadot/api");
const { typesBundlePre900 } = require("moonbeam-types-bundle")

export async function providePolkadotApi() {
    let api
    const wsEndpoints = process.env.RPC_ENDPOINTS ? process.env.RPC_ENDPOINTS.split(',') : []
    let wsIndex = 0;
    while (true) {
        try {
            const provider = new WsProvider(wsEndpoints[wsIndex % wsEndpoints.length]);
            await new Promise((resolve, reject) => {
                provider.on('connected', () => resolve(true));
                provider.on('disconnected', () => reject());
            });
            api = await ApiPromise.create({
                initWasm: false,
                provider,
                typesBundle: typesBundlePre900,
            });
            return api

        } catch (e) {
            console.log(e)
            wsIndex++
        }
    }
}

