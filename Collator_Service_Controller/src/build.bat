set _function="CollatorServiceController"
echo %_function%
set GOOS=linux
set GOARCH=amd64
cd src
gofmt -s -w . && ^
go build -o ..\dist\main main.go && ^
aws s3 cp --profile=mb "%cd%\..\dist\main" s3://data.stakeglmr.com/testing/%_function%.main && ^
cd ..