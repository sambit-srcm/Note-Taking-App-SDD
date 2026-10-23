## Purpose

Lets the owner look at an earlier save and restore it (FRS-VERSION-001, FRS-VERSION-002).

## ADDED Requirements

### Requirement: History panel
The owner SHALL see version titles and restore one. The public page SHALL not show this panel.

#### Scenario: Restore
- **WHEN** the owner restores a listed version
- **THEN** a restore request is sent and the panel says restored
