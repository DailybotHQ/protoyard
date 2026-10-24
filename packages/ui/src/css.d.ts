// Texuli's styled components import their own stylesheets (`import './button.css'`).
// Declared here so every package that type-checks through @protoyard/ui accepts them.
declare module '*.css' {
  const href: string;
  export default href;
}
