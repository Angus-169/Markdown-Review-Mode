/**
 * The type of a CSS module import.
 *
 * The client bundle compiles `*.module.css` into a class-name map, so the
 * import's type is a record of local names to the emitted class names.
 */
declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>
  export default classes
}
