/** A book's text as shipped to the device: `c[chapter - 1][verse - 1]`. */
export interface BookText {
  c: string[][];
  /** For verses the translation leaves out (empty in `c`): why, by "c:v". */
  n?: Record<string, string>;
}
