var AWS = require('aws-sdk');

// The AWS Region that you want to use to send the message. For a list of
// AWS Regions where the Amazon Pinpoint API is available, see
// https://docs.aws.amazon.com/pinpoint/latest/apireference/.
var aws_region = process.env.PINPOINT_REGION;

// The phone number or short code to send the message from. The phone number
// or short code that you specify has to be associated with your Amazon Pinpoint
// account. For best results, specify long codes in E.164 format.
var originationNumber = process.env.PINPOINT_ORIG_NUMBER;

// The recipient's phone number.  For best results, you should specify the
// phone number in E.164 format.
var destinationNumber = process.env.NOTIFY_PHONE;
var toAddress = process.env.NOTIFY_EMAIL;

// The Amazon Pinpoint project/application ID to use when you send this message.
// Make sure that the SMS channel is enabled for the project or application
// that you choose.
var applicationId = process.env.PINPOINT_APP_ID;

// The type of SMS message that you want to send. If you plan to send
// time-sensitive content, specify TRANSACTIONAL. If you plan to send
// marketing-related content, specify PROMOTIONAL.
var messageType = "TRANSACTIONAL";

// The registered keyword associated with the originating short code.
var registeredKeyword = process.env.PINPOINT_EGISTERED_KEYWORD;

// The sender ID to use when sending the message. Support for sender ID
// varies by country or region. For more information, see
// https://docs.aws.amazon.com/pinpoint/latest/userguide/channels-sms-countries.html
var senderId = process.env.NETWORK_NAME;

// Specify the region.
AWS.config.update({ region: aws_region });

// The character encoding the you want to use for the subject line and
// message body of the email.
var charset = "UTF-8";

//Create a new Pinpoint object.
var pinpoint = new AWS.Pinpoint();

/**
 * Implement your own notification logic
 */
export async function notify(message: string | undefined) {
    if (!message || !destinationNumber || !toAddress) {
        return
    }
    // mock function to send notifications
    // Specify the parameters to pass to the API.
    const params = {
        ApplicationId: applicationId,
        MessageRequest: {
            Addresses: {
                [destinationNumber]: {
                    ChannelType: 'SMS'
                }
            },
            MessageConfiguration: {
                SMSMessage: {
                    Body: message,
                    Keyword: registeredKeyword,
                    MessageType: messageType,
                    OriginationNumber: originationNumber,
                    SenderId: senderId,
                }
            }
        }
    };

    //Try to send the message.
    await pinpoint.sendMessages(params).promise();

    // Specify the parameters to pass to the API.
    const paramsEmail = {
        ApplicationId: applicationId,
        MessageRequest: {
            Addresses: {
                [toAddress]: {
                    ChannelType: 'EMAIL'
                }
            },
            MessageConfiguration: {
                EmailMessage: {
                    FromAddress: process.env.FROM_EMAIL,
                    SimpleEmail: {
                        Subject: {
                            Charset: charset,
                            Data: `${process.env.NETWORK_NAME} ALERT`
                        },
                        HtmlPart: {
                            Charset: charset,
                            Data: `<p>${message}</p>`
                        },
                        TextPart: {
                            Charset: charset,
                            Data: message
                        }
                    }
                }
            }
        }
    };

    //Try to send the email.
    await pinpoint.sendMessages(paramsEmail).promise();
}