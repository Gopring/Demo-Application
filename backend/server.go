package backend

import (
	"fmt"
	"log"
	"net/http"
)

type Backend struct {
	mux    *http.ServeMux
	server *http.Server
	config Config
}

func New(c Config) *Backend {
	b := &Backend{
		mux:    http.NewServeMux(),
		config: c,
	}
	b.routes()
	return b
}

func (b *Backend) routes() {
	fs := http.FileServer(http.Dir("./static"))
	b.mux.Handle("/", http.StripPrefix("/", fs))

	b.mux.HandleFunc("/html", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "./static/demo.html")
	})
}

func (b *Backend) Start() {
	b.server = &http.Server{
		Addr:    fmt.Sprintf(":%d", b.config.Port),
		Handler: b.mux,
	}
	if b.config.KeyFile == "" || b.config.CertFile == "" {
		log.Printf("Starting server on port %d", b.config.Port)
		if err := b.server.ListenAndServe(); err != nil {
			log.Fatalf("Sever failed to start")
		}
	} else {
		log.Printf("Starting tls server on port %d", b.config.Port)
		if err := b.server.ListenAndServeTLS(b.config.CertFile, b.config.KeyFile); err != nil {
			log.Fatalf("Sever failed to start")
		}
	}

}
