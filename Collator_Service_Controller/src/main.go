package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"

	_ "github.com/joho/godotenv/autoload"
	"stakebaby.com/collator-session-failover/shiden/services"
)

type ResponseMessage struct {
	Status string `json:"status"`
	Info   string `json:"info"`
}

type ValidateRequest struct {
	NetworkName string `json:"networkName"`
	Blob        string `json:"blob"`
}

type Payload struct {
	NetworkName string `json:"networkName"`
	Validate    bool   `json:"validate"`
	Backup      bool   `json:"backup"`
	Challenge   string `json:"challenge"`
}

type ChallengeResponse struct {
	Challenge string `json:"challenge"`
}

var lastChallenge string
var NETWORK_NAME string = os.Getenv("NETWORK_NAME")
var PORT string = os.Getenv("PORT")

func CheckEnvs() bool {
	return NETWORK_NAME != "" && PORT != ""
}

/*
* Receives a request to switch to backup or validator mode
* The method validates the request, and executes it using the systemd DBUS
 */
func handleFailover(writer http.ResponseWriter, request *http.Request) {

	if request.URL.Query().Get("networkName") != NETWORK_NAME {
		// ignore requests for other networks
		// useful if this service is deployed in mutliple VMs running different networks, so as to ignore requests directed to aother networks
		return
	}

	// unpack json request
	fmt.Println("Failover called")
	type_ := "application/json"
	writer.Header().Set("Content-Type", type_)
	var message ValidateRequest
	err := json.NewDecoder(request.Body).Decode(&message)
	if err != nil {
		fmt.Printf("Failed to decode JSON request:\n%v\n", err)
		http.Error(writer, "", http.StatusBadRequest)
		return
	}

	// convert encrypted string to base64 encoding
	rawDecodedText, err := base64.StdEncoding.DecodeString(message.Blob)
	if err != nil {
		fmt.Printf("Failed to decode blob:\n%v\n", err)
		http.Error(writer, "", http.StatusBadRequest)
		return
	}
	// decrypt the sting to get the payload
	plaintext, err := services.KMSDecrypt(rawDecodedText)

	if err != nil {
		fmt.Printf("Failed to decrypt blob:\n%v\n", err)
		http.Error(writer, "", http.StatusBadRequest)
		return
	}

	// load json into struct payload
	var payload Payload
	err = json.Unmarshal([]byte(plaintext), &payload)
	if err != nil {
		fmt.Printf("Failed to unmarshal decrypted blob into JSON:\n%v\n", err)
		http.Error(writer, "", http.StatusBadRequest)
		return
	}
	fmt.Printf("payload:\n%+v\n", payload)

	// fail if challenge code not the same as last one provided
	if payload.Challenge != lastChallenge {
		fmt.Println("False challenge")
		http.Error(writer, "", http.StatusForbidden)
		return
	}

	// execute systemd operation requested
	if payload.Validate {
		// This node must start participating in consensus
		fmt.Println("Activating Validator")
		err = services.MakeValidator()
		if err != nil {
			fmt.Printf("Failed to activate validator:\n%v", err)
			http.Error(writer, "", http.StatusServiceUnavailable)
			return
		}
		_ = json.NewEncoder(writer).Encode(ResponseMessage{
			Status: "200",
			Info:   "IS_NOW_VALIDATOR",
		})
	} else if payload.Backup {
		// This node must switch into being a backup node (no validation)
		fmt.Println("Activating backup")
		err = services.MakeBackup()
		if err != nil {
			fmt.Printf("Failed to activate backup:\n%v", err)
			http.Error(writer, "", http.StatusServiceUnavailable)
			return
		}
		_ = json.NewEncoder(writer).Encode(ResponseMessage{
			Status: "200",
			Info:   "IS_NOW_BACKUP",
		})
	}

}

/**
* Returns whether this server is currently in validator or backup mode
* Note that ANYBODY can call this endpoint from the outside; consider adding challenge+encryption if this is not acceptable
**/
func handleIsValidator(w http.ResponseWriter, r *http.Request) {

	if r.URL.Query().Get("networkName") != NETWORK_NAME {
		return
	}

	isV, err := services.IsValidator()
	if err != nil {
		fmt.Printf("Errror trying to determine if this node is in validator mode: %v\n", err)
		http.Error(w, "", http.StatusInternalServerError)
		return
	}
	_ = json.NewEncoder(w).Encode(ResponseMessage{
		Status: "200",
		Info:   fmt.Sprintf("%v", isV), // plaintext "true" if it is a validator, "false" otherwise
	})
}

/*
* Returns a one-time secret string that must be packaged in the subsequent encrypted request
* Protects from replay attacks
 */
func handleChallenge(w http.ResponseWriter, r *http.Request) {

	if r.URL.Query().Get("networkName") != NETWORK_NAME {
		return
	}
	lastChallenge = services.RandStringBytes(32)
	fmt.Println("Challenge requested")
	err := json.NewEncoder(w).Encode(ChallengeResponse{
		Challenge: lastChallenge,
	})
	if err != nil {
		fmt.Printf("Errror while producing challenge code: %v\n", err)
		http.Error(w, "", http.StatusInternalServerError)
		return
	}
}

/**
* This server is responsible for informing the CollatorHealthCheck AWS microservice if this mode is in validator or warm backup mode,
* and to receieve and execute authorized requests to change from validator mode -> backup mode, and the reverse.
* The service should always be running on the node.
*
* -- DOUBLE SIGNING WARNING --
* This setup does NOT guarantee that there won't be 2 or more nodes in Validator mode at one time. In particular, it is possible that
* a node goes offline and the microservice decides to turn another backup node into a validator node. While this node is offline, it
* cannot receive a request by the microservice to switch to backup mode. When the node comes back online, it may resume validation
* which may cause double signing. The microservice will detect that there are 2 validator nodes in the next run, and (depending on options)
* could take action to switch one of them to backup; however this won't happen immediately and it depends on how often CollatorHealthCheck runs.
* A short period of having 2 validators active may be OK in parachains, if there is no slashing and no threat of producing bad blocks, i.e.
* if the only effect is some temporary performance degredation.
**/
func main() {

	envOK := CheckEnvs() && services.CheckKMSEnvs() && services.CheckSystemdEnv()
	if !envOK {
		fmt.Println("Env variable/s missing. Check .env file in project root")
		return
	}

	fmt.Printf("Server started on port :%v\n", PORT)

	http.HandleFunc("/challenge", handleChallenge)

	http.HandleFunc("/failover", handleFailover)

	http.HandleFunc("/is-validator", handleIsValidator)

	err := http.ListenAndServe(fmt.Sprintf(":%v", PORT), nil)
	if err != nil {
		log.Printf("There was an error listening on port :%v\n%v", PORT, err)
	}

}
