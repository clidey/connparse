package connparse

type Address struct {
	Scheme      string            `json:"scheme"`
	Type        string            `json:"type"`
	Authority   map[string]any    `json:"authority"`
	Resource    Resource          `json:"resource"`
	Path        string            `json:"path"`
	Query       map[string]any    `json:"query"`
	Fragment    any               `json:"fragment"`
	Credentials map[string]string `json:"credentials"`
	Options     map[string]any    `json:"options"`
	Raw         string            `json:"raw"`
	Safe        string            `json:"safe"`
}

type Resource struct {
	Type string `json:"type"`
	Name any    `json:"name"`
}

type Diagnostic struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Path    string `json:"path,omitempty"`
}

type Result struct {
	OK       bool         `json:"ok"`
	Value    *Address     `json:"value"`
	Errors   []Diagnostic `json:"errors"`
	Warnings []Diagnostic `json:"warnings"`
}

type Options struct {
	Provider    string
	Strict      bool
	Definitions []Definition
}

type Definition struct {
	ID              string               `yaml:"id" json:"id"`
	Name            string               `yaml:"name" json:"name"`
	Type            string               `yaml:"type" json:"type"`
	Schemes         []string             `yaml:"schemes" json:"schemes"`
	Adapter         string               `yaml:"adapter" json:"adapter"`
	Defaults        map[string]any       `yaml:"defaults" json:"defaults"`
	Authority       map[string]any       `yaml:"authority" json:"authority"`
	ResourceRule    Rule                 `yaml:"resource" json:"resource"`
	PathRule        Rule                 `yaml:"path" json:"path"`
	CredentialsRule map[string]any       `yaml:"credentials" json:"credentials"`
	QueryParameters map[string]QueryRule `yaml:"query_parameters" json:"query_parameters"`
	Validation      ValidationRule       `yaml:"validation" json:"validation"`
	Options         map[string]any       `yaml:"options" json:"options"`
	Redaction       RedactionRule        `yaml:"redaction" json:"redaction"`
}

type Rule struct {
	Type     string `yaml:"type" json:"type"`
	Required bool   `yaml:"required" json:"required"`
}

type QueryRule struct {
	Type    string `yaml:"type" json:"type"`
	Allowed []any  `yaml:"allowed" json:"allowed"`
}

type ValidationRule struct {
	RequireHost bool      `yaml:"require_host" json:"require_host"`
	PortRange   PortRange `yaml:"port_range" json:"port_range"`
}

type PortRange struct {
	Min int `yaml:"min" json:"min"`
	Max int `yaml:"max" json:"max"`
}

type RedactionRule struct {
	SafeCredentials []string `yaml:"safe_credentials" json:"safe_credentials"`
	SensitiveKeys   []string `yaml:"sensitive_keys" json:"sensitive_keys"`
}

type parts struct {
	Scheme       string
	Username     string
	Password     string
	Host         string
	Port         any
	Hosts        []map[string]any
	Pathname     string
	PathSegments []string
	Query        map[string]any
	Fragment     any
}
