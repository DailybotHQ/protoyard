# Permissions

| Role | Read monitoring | Acknowledge alert | Resolve alert |
| --- | --- | --- | --- |
| `owner` | yes | yes | yes |
| `operator` | yes | yes | yes |
| `technician` | yes | yes | no |
| `viewer` | yes | no | no |

Services call `session.assert()` before parsing input or running a transaction.
The role model is a UI simulation and is not device access control or security.

The scenarios assign the owner, operator and viewer actors. The offline
scenario leaves records readable and makes service writes fail through the
simulated network environment.
