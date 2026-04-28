# Clinical insights module

This module defines the safe foundation for AI and data insights.

Current behavior:
- Uses deterministic rules only.
- Does not call external AI providers.
- Does not produce diagnosis or autonomous treatment decisions.
- Converts existing inventory and anamnesis data into auditable alerts.

Why this exists before real AI:
- It creates stable contracts for future model integrations.
- It keeps clinical responsibility with the professional.
- It gives the product useful insights now while avoiding unsafe automation.

Future integration points:
- Speech/document extraction can feed anamnesis drafts into the same contracts.
- Predictive stock can be upgraded with historical consumption data.
- Protocol suggestions can be added as reviewed recommendations, never automatic prescriptions.