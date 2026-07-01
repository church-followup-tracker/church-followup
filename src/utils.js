export const GROUPS = ["A", "B", "C", "D"];

export const GROUP_META = {
  A: { bg: "#E6F1FB", color: "#0C447C", border: "#85B7EB", light: "#F0F7FD" },
  B: { bg: "#E1F5EE", color: "#085041", border: "#5DCAA5", light: "#EDFAF5" },
  C: { bg: "#FAEEDA", color: "#633806", border: "#EF9F27", light: "#FDF6EC" },
  D: { bg: "#FBEAF0", color: "#72243E", border: "#ED93B1", light: "#FEF3F7" },
};

export const STATUS_META = {
  pending:      { label: "Pending",       bg: "#F1F0EC", color: "#5F5E5A", border: "#C4C2BA" },
  calling:      { label: "Calling now",   bg: "#E6F1FB", color: "#0C447C", border: "#85B7EB" },
  called:       { label: "Called ✓",      bg: "#EAF3DE", color: "#27500A", border: "#97C459" },
  not_reached:  { label: "Not reached",   bg: "#FAEEDA", color: "#633806", border: "#EF9F27" },
  left_message: { label: "Left message",  bg: "#EEEDFE", color: "#26215C", border: "#AFA9EC" },
};

export function groupForOffset(listWeek, displayWeek) {
  const off = displayWeek - listWeek;
  if (off < 0 || off > 3) return null;
  return GROUPS[off];
}

export function uid() {
  return "v" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
}

export function fmtDateTime(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return (
    d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) +
    " " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  );
}
