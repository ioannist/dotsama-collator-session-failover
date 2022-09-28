package services

import (
	"fmt"
	"os"

	"github.com/aws/aws-sdk-go/aws/awserr"
	"github.com/aws/aws-sdk-go/service/kms"
)

var KMS_KEY_ID string = os.Getenv("KMS_KEY_ID")
var KMS_REGION string = os.Getenv("KMS_REGION")

func CheckKMSEnvs() bool {
	return KMS_KEY_ID != "" && KMS_REGION != ""
}

func KMSDecrypt(message []byte) (string, error) {

	output, err := KMSSvc().Decrypt(&kms.DecryptInput{
		CiphertextBlob: message,
		KeyId:          &KMS_KEY_ID,
	})
	if err != nil {
		fmt.Println(err)
		if _, ok := err.(awserr.Error); ok {
			return "", err
		}
		exitErrorf("unknown error occurred, %v", err)
	}
	return string(output.Plaintext), nil
}
