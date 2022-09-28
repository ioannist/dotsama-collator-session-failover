const AWS = require('aws-sdk');

const kms = new AWS.KMS({ region: process.env.KMS_REGION });
const keyId = process.env.KMS_KEY_ID

export async function encryptPayload(payload: any) {
    const json = JSON.stringify(payload)
    const plaintext = Buffer.from(json)
    const encrypted = await kms.encrypt({ KeyId: keyId, Plaintext: plaintext }).promise()
    console.log({encrypted: encrypted.CiphertextBlob.toString('base64')})
    return encrypted.CiphertextBlob.toString('base64')
}

export async function decryptMessage(message: string) {
    const { Plaintext } = await kms.decrypt({ CiphertextBlob: message, KeyId: keyId }).promise()
    return JSON.parse(Plaintext)
}