package services

import (
	"fmt"
	"math/rand"
	"os"
	"time"
)

func exitErrorf(msg string, args ...interface{}) {
	fmt.Fprintf(os.Stderr, msg+"\n", args...)
	os.Exit(1)
}

// ΜakeTimestampSeconds
func ΜakeTimestampSeconds() int64 {
	return time.Now().UnixNano() / (int64(time.Second) / int64(time.Nanosecond))
}

const letterBytes = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"

func RandStringBytes(n int) string {
	b := make([]byte, n)
	for i := range b {
		b[i] = letterBytes[rand.Intn(len(letterBytes))]
	}
	return string(b)
}
