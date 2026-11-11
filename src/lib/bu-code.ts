/** Business unit codes: 2–6 capital letters or digits, e.g. ENG. They go into client codes (CL-ENG-0007). */
export const BU_CODE_RE = /^[A-Z0-9]{2,6}$/;

const KNOWN: Record<string, string> = {
  "eram engineering": "ENG",
  "eram trading": "TRD",
  "eram egypt": "EGY",
  "eram namibia": "NAM",
  "source philipines": "SPH",
  "source philippines": "SPH",
  "source india": "SIN",
  "source russia": "SRU",
  "source france": "SFR",
  "eram hcm": "HCM",
  "eram digital": "DIG",
};

/** A starting code for a unit name (the agreed code for known units, else the first letters of the last word). */
export function suggestBuCode(name: string) {
  const known = KNOWN[name.trim().toLowerCase()];
  if (known) return known;
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, "").split(/\s+/).filter(Boolean);
  return (words.at(-1) ?? "BU").slice(0, 3).padEnd(2, "X");
}
