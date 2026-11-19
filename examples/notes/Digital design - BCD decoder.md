---
cssclasses: [circuit-study-note]
---
*Digital design · Lab notes 04*

## From four bits to a lit digit

A BCD digit (A = MSB) drives a seven-segment display. Every segment is a sum of products, so the decoder is a small PLA: three inverters make the complemented rails, nine AND gates form shared product terms and seven OR gates collect them.

```lecircuit
/examples/notes/BCD to seven-segment decoder.lecircuit
width: 90%
```

### Minimizing with don't-cares

Codes 1010–1111 never occur in BCD, so the K-maps treat them as don't-cares. Segment **d** needs five terms instead of seven, and B′D′ serves segments a, d and e at once.

### Checking it in Simulate

Stepping through the truth table lights the expected digit for all ten codes: 0101 drives a, c, d, f and g and reads as **5**. Codes above 1001 show arbitrary patterns, a result of the don't-cares rather than a wiring error.
