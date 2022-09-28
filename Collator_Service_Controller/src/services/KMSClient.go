package services

import (
	"sync"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/kms"
)

var onceKMS sync.Once
var kmsSvc *kms.KMS

func initializeKMSSingletons() {
	sess := session.Must(session.NewSessionWithOptions(session.Options{
		SharedConfigState: session.SharedConfigEnable,
	}))
	kmsSvc = kms.New(sess, aws.NewConfig().WithRegion(KMS_REGION))
}

// KMSSvc initializes kms
func KMSSvc() *kms.KMS {
	onceKMS.Do(initializeKMSSingletons)
	return kmsSvc
}
