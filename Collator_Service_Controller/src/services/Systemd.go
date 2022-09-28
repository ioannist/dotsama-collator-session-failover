package services

import (
	"context"
	"fmt"
	"os"

	"github.com/coreos/go-systemd/v22/dbus"
	_ "github.com/joho/godotenv/autoload"
)

var unitNameValidator string = os.Getenv("COLLATOR_SERVICE")
var unitNameBackup string = os.Getenv("COLLATOR_SERVICE_BACKUP")

func CheckSystemdEnv() bool {
	return unitNameBackup != "" && unitNameValidator != ""
}

/**
* Returns true if this node is in validator mode, i.e. if the validator service is running
**/
func IsValidator() (bool, error) {
	if unitNameValidator == "" || unitNameBackup == "" {
		return false, fmt.Errorf("Collator service env variables not set\n")
	}
	conn, err := dbus.NewSystemConnectionContext(context.Background())
	if err != nil {
		return false, err
	}
	defer conn.Close()

	unitStatus, err := conn.ListUnitsByNamesContext(context.Background(), []string{unitNameValidator})
	if err != nil {
		return false, err
	}
	if len(unitStatus) == 0 {
		return false, fmt.Errorf("Could not locate services")
	}
	if unitStatus[0].SubState == "running" {
		return true, nil
	}
	return false, nil
}

/*
* The server has two service units, one for operating the node as a warm backup, and one for operating as a validator
* The method checks if the backup service is running and the validator service is NOT running, if so,
* the method stops the backup service and starts the validator service
* The two services cannot run simultaneously (each one is listed in the other one's Conflicts), nevertheless, the method stops one before starting the other for clarity
 */
func MakeValidator() error {

	if unitNameValidator == "" || unitNameBackup == "" {
		return fmt.Errorf("Collator service env variables not set\n")
	}

	conn, err := dbus.NewSystemConnectionContext(context.Background())
	if err != nil {
		return err
	}
	defer conn.Close()

	unitStatus, err := conn.ListUnitsByNamesContext(context.Background(), []string{unitNameValidator, unitNameBackup})
	if err != nil {
		return err
	}
	if len(unitStatus) <= 1 {
		return fmt.Errorf("Could not locate services")
	}
	// fmt.Printf("%+v", unitStatus[0])
	if unitStatus[0].SubState == "running" {
		return fmt.Errorf("Node is already Validator")
	}
	if unitStatus[1].SubState != "running" {
		return fmt.Errorf("Backup service was expected to be in running state but was not")
	}

	fmt.Println("Stopping backup service")
	chStop := make(chan string)
	_, err = conn.StopUnitContext(context.Background(), unitNameBackup, "replace", chStop)
	if err != nil {
		return err
	}
	for message := range chStop {
		if message == "done" {
			fmt.Println("Comeplted stopping service")
			break
		}
	}

	fmt.Println("Starting validator service")
	chStart := make(chan string)
	_, err = conn.StartUnitContext(context.Background(), unitNameValidator, "replace", chStart)
	if err != nil {
		return err
	}
	for message := range chStart {
		if message == "done" {
			fmt.Println("Completed starting service")
			break
		}
	}

	return nil
}

/*
* The server has two service units, one for operating the node as a warm backup, and one for operating as a validator
* This method starts the backup service, regardless of the current state/status of backup and validator services
* The two services cannot run simultaneously (each one is listed in the other one's Conflicts), so by starting the backup service, the validator service is stopped (if it is running)
 */
func MakeBackup() error {

	if unitNameValidator == "" || unitNameBackup == "" {
		return fmt.Errorf("Collator service env variables not set\n")
	}

	conn, err := dbus.NewSystemConnectionContext(context.Background())
	if err != nil {
		return err
	}
	defer conn.Close()

	unitStatus, err := conn.ListUnitsByNamesContext(context.Background(), []string{unitNameBackup})
	if err != nil {
		return err
	}
	if len(unitStatus) == 0 {
		return fmt.Errorf("Could not locate services")
	}
	// fmt.Printf("%+v", unitStatus[0])
	if unitStatus[0].SubState == "running" {
		return fmt.Errorf("Node is already backup")
	}

	fmt.Println("Stopping validator service")
	chStop := make(chan string)
	_, err = conn.StopUnitContext(context.Background(), unitNameValidator, "replace", chStop)
	if err != nil {
		return err
	}

	fmt.Println("Starting backup service")
	chStart := make(chan string)
	_, err = conn.StartUnitContext(context.Background(), unitNameBackup, "replace", chStart)
	if err != nil {
		return err
	}
	for message := range chStart {
		if message == "done" {
			fmt.Println("Completed starting service")
			break
		}
	}

	return nil
}
