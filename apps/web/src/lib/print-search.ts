/** A print view's address: `?print=true` opens the print dialog as it shows (from Export). */
export interface PrintSearch {
  print?: true;
}

export function validatePrintSearch(search: Record<string, unknown>): PrintSearch {
  return { print: search.print === true ? true : undefined };
}
