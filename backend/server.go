package backend

import (
	"fmt"
	"html/template"
	"log"
	"net/http"
)

const (
	staticDir     = "./static"
	staticRoute   = "/static/"
	templateFile  = "static/demo.html"
	errorTemplate = "Unable to load template"
	errorRender   = "Unable to render template"
)

// Backend represents the backend server.
type Backend struct {
	mux    *http.ServeMux
	server *http.Server
	config Config
}

// New initializes and returns a new Backend instance.
func New(c Config) *Backend {
	b := &Backend{
		mux:    http.NewServeMux(),
		config: c,
	}
	b.setupRoutes()
	return b
}

// setupRoutes configures the HTTP routes for the server.
func (b *Backend) setupRoutes() {
	// Serve static files
	fs := http.FileServer(http.Dir(staticDir))
	b.mux.Handle(staticRoute, http.StripPrefix(staticRoute, fs))

	// Serve the main page
	b.mux.HandleFunc("/", b.serveHTML)
}

// serveHTML renders the main template with the SignalServerURL.
func (b *Backend) serveHTML(w http.ResponseWriter, r *http.Request) {
	tmpl, err := template.ParseFiles(templateFile)
	if err != nil {
		log.Printf("%s: %v", errorTemplate, err)
		http.Error(w, errorTemplate, http.StatusInternalServerError)
		return
	}

	data := struct {
		SignalServerURL string
	}{
		SignalServerURL: b.config.SignalServerURL,
	}

	if err := tmpl.Execute(w, data); err != nil {
		log.Printf("%s: %v", errorRender, err)
		http.Error(w, errorRender, http.StatusInternalServerError)
	}
}

// Start launches the HTTP or HTTPS server based on the configuration.
func (b *Backend) Start() {
	b.server = &http.Server{
		Addr:    fmt.Sprintf(":%d", b.config.Port),
		Handler: b.mux,
	}

	if b.isTLSConfigured() {
		b.startTLSServer()
	} else {
		b.startHTTPServer()
	}
}

// isTLSConfigured checks if TLS configuration is provided.
func (b *Backend) isTLSConfigured() bool {
	return b.config.KeyFile != "" && b.config.CertFile != ""
}

// startHTTPServer starts the server without TLS.
func (b *Backend) startHTTPServer() {
	log.Printf("Starting server on port %d", b.config.Port)
	if err := b.server.ListenAndServe(); err != nil {
		log.Fatalf("Server failed to start: %v", err)
	}
}

// startTLSServer starts the server with TLS.
func (b *Backend) startTLSServer() {
	log.Printf("Starting TLS server on port %d", b.config.Port)
	if err := b.server.ListenAndServeTLS(b.config.CertFile, b.config.KeyFile); err != nil {
		log.Fatalf("Server failed to start: %v", err)
	}
}
