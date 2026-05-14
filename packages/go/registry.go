package connparse

import "strings"

type Registry struct {
	byID     map[string]Definition
	byScheme map[string]Definition
}

func NewRegistry(definitions []Definition) (*Registry, error) {
	r := &Registry{byID: map[string]Definition{}, byScheme: map[string]Definition{}}
	for _, def := range definitions {
		if err := ValidateDefinition(def); err != nil {
			return nil, err
		}
		r.Register(def)
	}
	return r, nil
}

func DefaultRegistry() *Registry {
	r, _ := NewRegistry(BuiltInDefinitions())
	return r
}

func (r *Registry) Register(def Definition) {
	r.byID[strings.ToLower(def.ID)] = def
	for _, scheme := range def.Schemes {
		r.byScheme[strings.ToLower(scheme)] = def
	}
}

func (r *Registry) ByID(id string) (Definition, bool) {
	def, ok := r.byID[strings.ToLower(id)]
	return def, ok
}

func (r *Registry) ByScheme(scheme string) (Definition, bool) {
	def, ok := r.byScheme[strings.ToLower(scheme)]
	return def, ok
}
