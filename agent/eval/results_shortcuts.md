# Shortcuts eval

Ran 2026-10-18T09:52:07.667101+05:30 against the live workspace as prince (read-only).

## Drafting from plain words

- Valid drafts: **12/12** (good command, numbered steps, ids turned into blanks)
- Off-topic bots refused: **5/5**
- Draft time: median 2.2 s

| description | ok | /command | blanks |
|---|---|---|---|
| Check a PO's delivery schedule, its latest certificate and open NCRs for that vendor | ✓ | po-status-check | PO number, vendor name |
| Before an inspection, check which certificate values for a heat number are out of spec | ✓ | heat-spec-check | heat number |
| Tell me the latest revision of a drawing, who approved it and what changed | ✓ | drawing-revision | Drawing number |
| Every Monday: which vendors are late on their promises and what they owe me | ✓ | vendor-promises-due |  |
| har Monday dekho kaun se vendor late hain aur unke promises kya the | ✓ | vendor-late-list |  |
| Kisi machine ka downtime history aur pichhle fixes batao | ✓ | machine-downtime-history | Machine Name |
| Prep me for my next meeting: who is attending, open tasks with them and recent decisions | ✓ | prep-meeting |  |
| Find the decisions taken about a part and why they were taken | ✓ | part-decision-history | Part Name |
| For a vendor, compare promised and actual dispatch dates this month | ✓ | vendor-dispatch-audit | vendor name, month |
| Draft a reminder task to follow up with the vendor on a PO tomorrow morning | ✓ | vendor-po-reminder | PO number, vendor name |
| Check PO-7781 delivery and certificates | ✓ | check-po-status | PO number |
| Heat K-55210 ka certificate S355J2 ke limits ke against check karo | ✓ | heat-cert-check | heat number, grade |

