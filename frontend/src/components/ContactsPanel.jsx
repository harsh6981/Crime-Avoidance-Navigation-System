import { useState, useEffect } from "react";

const BACKEND_URL = "http://localhost:8000";

export default function ContactsPanel({ user }) {
  const [contacts, setContacts] = useState([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("+91");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      fetchContacts();
    }
  }, [user]);

  async function fetchContacts() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/users/trusted-contacts?user_id=${user.user_id}`);
      if (res.ok) {
        const data = await res.json();
        setContacts(data.contacts || []);
      }
    } catch (err) {
      console.error("Failed to fetch contacts", err);
    }
  }

  async function handleAddContact() {
    setError(null);
    const phoneRegex = /^\+91\d{10}$/;

    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!phoneRegex.test(phone)) {
      setError("Phone number must be in format: +91XXXXXXXXXX");
      return;
    }
    if (contacts.length >= 5) {
      setError("Maximum of 5 contacts allowed");
      return;
    }
    if (contacts.some((c) => c.phone === phone)) {
      setError("Contact with this phone number already exists");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/users/trusted-contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.user_id,
          contacts: [{ name, phone }]
        }),
      });
      
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || "Failed to add contact");
      } else {
        setName("");
        setPhone("+91");
        fetchContacts();
      }
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteContact(phoneToDelete) {
    if (!window.confirm("Are you sure you want to delete this contact?")) return;
    
    try {
      const res = await fetch(`${BACKEND_URL}/api/users/trusted-contacts`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.user_id,
          phone: phoneToDelete
        }),
      });

      if (res.ok) {
        fetchContacts();
      } else {
        const data = await res.json();
        setError(data.detail || "Failed to delete contact");
      }
    } catch (err) {
      setError("Network error. Please try again.");
    }
  }

  if (!user) return null;

  return (
    <div className="panel-section">
      <div className="section-title">👉 Emergency Contacts</div>
      
      {/* ── ADD CONTACT FORM ── */}
      <div style={{ marginBottom: "12px", background: "var(--bg-card)", padding: "12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)" }}>
        <div className="form-row">
          <label className="form-label">Name</label>
          <input
            className="input-field"
            placeholder="e.g. Mom"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="form-row">
          <label className="form-label">Phone Number</label>
          <input
            className="input-field"
            placeholder="+91XXXXXXXXXX"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        
        {error && (
          <div style={{ color: "var(--accent-red)", fontSize: "0.75rem", marginBottom: "8px" }}>
            ⚠ {error}
          </div>
        )}
        
        <button 
          className="btn-primary" 
          onClick={handleAddContact} 
          disabled={loading || contacts.length >= 5}
        >
          {loading ? "Adding..." : "Add Contact"}
        </button>
      </div>

      {/* ── CONTACTS LIST ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {contacts.map((c, i) => (
          <div key={i} style={{ 
            display: "flex", 
            justifyContent: "space-between", 
            alignItems: "center",
            background: "rgba(15, 23, 42, 0.5)",
            padding: "8px 12px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border)"
          }}>
            <div>
              <div style={{ fontSize: "0.85rem", fontWeight: 600 }}>{c.name}</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{c.phone}</div>
            </div>
            <button 
              onClick={() => handleDeleteContact(c.phone)}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--accent-red)",
                cursor: "pointer",
                fontSize: "1rem",
                padding: "4px"
              }}
              title="Delete Contact"
            >
              ×
            </button>
          </div>
        ))}
        {contacts.length === 0 && (
          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textAlign: "center", padding: "10px 0" }}>
            No trusted contacts added yet.
          </div>
        )}
      </div>
      <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "8px", textAlign: "right" }}>
        {contacts.length} / 5 Contacts
      </div>
    </div>
  );
}
