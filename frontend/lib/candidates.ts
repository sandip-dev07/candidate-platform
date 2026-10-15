export type MessageStatus =
  | "read"
  | "Failed"
  | "Sent"
  | "Delivered"
  | "sent"
  | "delivered"
  | "failed"
  | "scheduled";

export type Candidate = {
  id: string;
  name: string;
  phone: string;
  email: string;
  lastMessage: string | null;
  status: MessageStatus | null;
};

// Figma fixtures for the initial UI. Replace with API data when the provider is integrated.
export const initialCandidates: Candidate[] = [
  { id: "A1B2C3", name: "Krishna Khandelwal", phone: "+91 9876543210", email: "krishna.khandelwal@gmail.com", lastMessage: "12-10-2026", status: "read" },
  { id: "D4E5F6", name: "Urvashi Soni", phone: "+91 9123456789", email: "", lastMessage: "15-10-2026", status: "Failed" },
  { id: "G7H8I9", name: "Aditya Kumar", phone: "+91 9988766554", email: "", lastMessage: "18-10-2026", status: "read" },
  { id: "J1K2L3", name: "Ajit Srivastava", phone: "+91 9234567890", email: "", lastMessage: "21-10-2026", status: "read" },
  { id: "M4N5O6", name: "Aniket Sawant", phone: "+91 9876512345", email: "", lastMessage: "24-10-2026", status: "Sent" },
  { id: "P7Q8R9", name: "Ira Akbar", phone: "+91 9456789012", email: "", lastMessage: null, status: null },
  { id: "S1T2U3", name: "Amarjeet Kumar", phone: "+91 9012345678", email: "", lastMessage: null, status: null },
];


export type CommunicationMessage = {
  id: string;
  date: string;
  time: string;
  text: string;
  status: MessageStatus;
};

// Screenshot fixtures, scoped to Krishna. Other candidates have no loaded history.
// Kept as an offline fallback; live data comes from GET /candidates/{id}/messages.
export const initialCommunicationHistory: Record<string, CommunicationMessage[]> = {
  A1B2C3: [
    { id: "krishna-1", date: "25-10-2026", time: "9:47 AM", status: "Sent", text: "This is a test message." },
    { id: "krishna-2", date: "23-10-2026", time: "10:47 AM", status: "read", text: "Great ideas often begin with simple observations. Creativity grows when we explore new perspectives and challenge familiar ways of thinking. Every small step brings us closer to meaningful progress. The key is to stay curious, embrace change, and keep moving forward." },
    { id: "krishna-3", date: "19-09-2026", time: "10:00 PM", status: "read", text: "The world is full of possibilities waiting to be explored. Every day brings new opportunities to learn, grow, and discover something unexpected. Sometimes, the smallest moments leave the biggest impressions on our lives. What truly matters is how we choose to make the most of them." },
    { id: "krishna-4", date: "12-09-2026", time: "10:00 PM", status: "read", text: "Every new experience brings an opportunity to learn something valuable. Even the smallest steps can lead to meaningful changes over time." },
    { id: "krishna-5", date: "09-09-2026", time: "10:00 PM", status: "read", text: "The world is full of possibilities waiting to be explored. Every day brings new opportunities to learn, grow, and discover something unexpected. Sometimes, the smallest moments leave the biggest impressions on our lives. What truly matters is how we choose to make the most of them." },
  ],
};

/** Map a backend status (lowercase) to the UI display form. */
export function toDisplayStatus(status: string): MessageStatus {
  const s = status.toLowerCase();
  if (s === "sent") return "Sent";
  if (s === "delivered") return "Delivered";
  if (s === "failed") return "Failed";
  if (s === "read") return "read";
  if (s === "scheduled") return "scheduled";
  return "Sent";
}

/** Format an ISO timestamp from the API into the history UI's date/time parts. */
export function formatApiTimestamp(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: "—", time: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "—", time: "" };
  const date = d.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).replaceAll("/", "-");
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return { date, time };
}
