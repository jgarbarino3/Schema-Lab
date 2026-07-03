# Schema-Lab Glossary

## Folded Mirror Pair

A folded mirror pair is a single schematic component that represents two separate planar mirror faces at right angles in one compact payload. In v1 it is layout and visual metadata only; it does not own beam timing, reflection, or internal two-bounce propagation.

## Delay Stage

A delay stage is the mechanical stage component that carries delay-line travel, scan position, topology, and zero-offset configuration. It may host visual payloads such as a folded mirror pair on its optic seat.

## Delay-Line Timing Owner

The delay-line timing owner is the component whose `delayLine` config contributes internal optical path and femtosecond delay to beam tracing. For FROG-style delay schematics, the delay stage is the timing owner, even when a folded mirror pair is attached on top.
