package main

import (
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"os"
	"pdn-customer/backend"
)

func cmd(w io.Writer, args []string) (backend.Config, error) {
	con := backend.Config{}
	fs := flag.NewFlagSet("pdn", flag.ContinueOnError)
	fs.SetOutput(w)
	fs.IntVar(&con.Port, "port", 3000, "listening port")
	fs.StringVar(&con.KeyFile, "key", "", "key file path")
	fs.StringVar(&con.CertFile, "cert", "", "cert file path")
	fs.StringVar(&con.SignalServerURL, "SignalServerURL", "", "signal server url")
	err := fs.Parse(args)
	if err != nil {
		return backend.Config{}, fmt.Errorf("failed to parse args: %w", err)
	}

	if fs.NArg() != 0 {
		return backend.Config{}, errors.New("some args are not parsed")
	}

	return con, nil
}

func main() {
	con, err := cmd(os.Stdout, os.Args[1:])
	if err != nil {
		log.Fatal(err)
	}
	back := backend.New(con)
	back.Start()
}
