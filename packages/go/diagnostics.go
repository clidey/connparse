package connparse

func diagnostic(code, message, path string) Diagnostic {
	d := Diagnostic{Code: code, Message: message}
	if path != "" {
		d.Path = path
	}
	return d
}

func fail(code, message, path string) Result {
	return Result{
		OK:       false,
		Value:    nil,
		Errors:   []Diagnostic{diagnostic(code, message, path)},
		Warnings: []Diagnostic{},
	}
}

func ok(value *Address, errors []Diagnostic, warnings []Diagnostic) Result {
	if errors == nil {
		errors = []Diagnostic{}
	}
	if warnings == nil {
		warnings = []Diagnostic{}
	}
	if len(errors) > 0 {
		return Result{OK: false, Value: nil, Errors: errors, Warnings: warnings}
	}
	return Result{OK: true, Value: value, Errors: errors, Warnings: warnings}
}
