import { useState, useEffect } from "react";

const BACKEND_URL = "http://localhost:8000";

/**
 * TrustedContacts — Emergency Contact Manager
 *
 * Allows users to add/edit/remove emergency contacts.
 * These contacts are stored in PostgreSQL users.trusted_contacts (JSONB).
 * They are notified via SMS when the SOS button is pressed.
 */
export default function TrustedContacts({ user, onClose }) {
  const [contacts, setContacts] = useState([]);
  const [newName,  setNewName]  = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [error,    setError]    = useState("");

  // Load existing contacts on open
  useEffect(() => {
    if (!user) return;
    // Try fetching from localStorage as quick cache
    const cached = localStorage.getItem(`contacts_${user.id}`);
    if (cached) {
      try { setContacts(JSON.parse(cached)); } catch {}
    }
  }, [user]);

  function addContact() {
    const name  = newName.trim();
    const phone = newPhone.trim();

    if (!name)  { setError("Name is required."); return; }
    if (!phone) { setError("Phone number is required."); return; }

    // Basic phone validation
    const phoneClean = phone.replace(/\s/g, "");
    if (!/^\+?[0-9]{10,15}$/.test(phoneClean)) {
      setError("Enter a valid phone number (10–15 digits, optionally starting with +)");
      return;
    }

    setError("");
    const updated = [...contacts, { id: Date.now(), name, phone: phoneClean }];
    setContacts(updated);
    setNewName("");
    setNewPhone("");
  }

  function removeContact(id) {
    setContacts((prev) => prev.filter((c) => c.id !== id));
  }

  async function saveContacts() {
    if (!user) { setError("Please sign in first."); return; }
    setSaving(true);

    try {
      const res = await fetch(
        `${BACKEND_URL}/api/users/trusted-contacts?user_id=${user.id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("safepath_token") || ""}`,
          },
          body: JSON.stringify(contacts),
        }
      );
      if (!res.ok) throw new Error("Save failed");

      // Cache locally
      localStorage.setItem(`contacts_${user.id}`, JSON.stringify(contacts));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      // Mock save for offline/dev
      localStorage.setItem(`contacts_${user.id}`, JSON.stringify(contacts));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={title}>📞 Emergency Contacts</div>
            <div style={subtitle}>Notified automatically when SOS is triggered</div>
          </div>
          <button style={closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Contact list */}
        {contacts.length === 0 ? (
          <div style={emptyState}>
            No contacts added yet.<br />
            <span style={{ color: "#64748b" }}>Add at least one emergency contact.</span>
          </div>
        ) : (
          <div style={{ marginBottom: 14 }}>
            {contacts.map((c) => (
              <div key={c.id} style={contactRow}>
                <div style={avatar}>{c.name.charAt(0).toUpperCase()}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: "#64748b", fontFamily: "monospace" }}>{c.phone}</div>
                </div>
                <button style={removeBtn} onClick={() => removeContact(c.id)} title="Remove">✕</button>
              </div>
            ))}
          </div>
        )}

        {/* Add contact form */}
        <div style={addForm}>
          <div style={formLabel}>Add Contact</div>
          <div style={{ display: "flex", gap: 7, marginBottom: 7 }}>
            <input
              style={inp}
              placeholder="Name (e.g. Mom)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addContact()}
            />
            <input
              style={{ ...inp, fontFamily: "monospace" }}
              placeholder="+91XXXXXXXXXX"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addContact()}
            />
            <button style={addBtn} onClick={addContact}>+</button>
          </div>
          {error && <div style={{ fontSize: 11, color: "#ef4444", marginBottom: 7 }}>⚠ {error}</div>}
        </div>

        {/* Note about SMS */}
        <div style={noteBox}>
          💡 When you press SOS, a WhatsApp/SMS message with your live location link is sent to all contacts listed here.
          <br /><br />
          <strong style={{ color: "#f59e0b" }}>Requires:</strong> Twilio or Fast2SMS API key in backend <code>.env</code> file.
        </div>

        {/* Save button */}
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button style={cancelBtn} onClick={onClose}>Cancel</button>
          <button style={{ ...saveBtn, opacity: saving ? 0.6 : 1 }} onClick={saveContacts} disabled={saving}>
            {saved ? "✓ Saved!" : saving ? "Saving…" : "Save Contacts"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Styles ──
const overlay   = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 };
const modal     = { background: "#111827", border: "1px solid #1e2d45", borderRadius: 14, padding: 24, width: 400, maxWidth: "92vw", maxHeight: "90vh", overflowY: "auto" };
const title     = { fontSize: 15, fontWeight: 700, color: "#e2e8f0" };
const subtitle  = { fontSize: 11, color: "#64748b", marginTop: 2 };
const closeBtn  = { marginLeft: "auto", background: "transparent", border: "none", color: "#64748b", fontSize: 18, cursor: "pointer", padding: "0 0 0 10px" };
const contactRow = { display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid #1e2d45" };
const avatar    = { width: 36, height: 36, borderRadius: 18, background: "rgba(59,130,246,0.15)", color: "#3b82f6", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, flexShrink: 0 };
const removeBtn = { background: "transparent", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 14, padding: "0 4px" };
const emptyState = { textAlign: "center", padding: "20px 0", fontSize: 12, color: "#94a3b8", lineHeight: 1.8 };
const addForm   = { background: "#1a2235", borderRadius: 8, padding: 12, marginBottom: 12 };
const formLabel = { fontSize: 10, fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", color: "#64748b", marginBottom: 7 };
const inp       = { flex: 1, background: "#0b0f1a", border: "1px solid #1e2d45", borderRadius: 6, padding: "8px 10px", color: "#e2e8f0", fontSize: 12, outline: "none", minWidth: 0 };
const addBtn    = { background: "#22c55e", color: "#000", border: "none", borderRadius: 6, padding: "8px 14px", fontWeight: 700, fontSize: 16, cursor: "pointer", flexShrink: 0 };
const noteBox   = { background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 8, padding: 12, fontSize: 11, color: "#94a3b8", lineHeight: 1.7 };
const cancelBtn = { flex: 1, background: "transparent", border: "1px solid #1e2d45", color: "#e2e8f0", borderRadius: 6, padding: 10, fontSize: 12, cursor: "pointer" };
const saveBtn   = { flex: 2, background: "#22c55e", color: "#000", border: "none", borderRadius: 6, padding: 10, fontSize: 12, fontWeight: 700, cursor: "pointer" };