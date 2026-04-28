# Engagement module

This module defines the first safe layer for patient engagement automations.

Current behavior:
- Selects reactivation candidates from existing client and appointment data.
- Builds suggested WhatsApp copy for human or workflow review.
- Does not send messages automatically.
- Skips clients without valid phone, clients with upcoming appointments and explicit opt-out flags when present.

Why this is separated from WhatsApp sending:
- Campaign selection must be auditable before automation.
- Clinics need control over who receives reactivation messages.
- The WhatsApp provider can later consume these candidates using approved templates.