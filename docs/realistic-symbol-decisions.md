# Realistic Symbol Decisions

Date: 2026-05-31

The public Symbol Library ballot was used only as an internal design tool. The app now uses this fixed visual decision map for realistic renderers:

| Family | Final style |
| --- | --- |
| Planar mirror | Technical |
| Curved mirror | Technical |
| Lens | Technical |
| Beamsplitter | Technical |
| Iris / aperture | AO schematic |
| Filter | Hardware |
| Polarizer / waveplate | Technical |
| Detector | Hardware |
| Beam dump | Hardware |
| Laser/source box | Hardware |
| Support/postholder | Technical |
| Material realism | Catalog-like |
| Unvoted realistic families | Technical fallback |

These decisions are visual only. They must not change catalog dimensions, footprints, body bounds, mount bounds, support/postholder dimensions, anchors, ports, hit bounds, placement, snapping, serialized scene JSON, or export geometry.

Catalog/vendor dimensions remain authoritative. Renderer style branches may add or remove internal detail, line treatment, shading, screws, rings, labels, and material contrast only inside the existing measured envelopes.
