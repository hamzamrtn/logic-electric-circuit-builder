---
cssclasses: [circuit-study-note]
---
*Digital electronics · Study notes 04*

## Four-bit arithmetic, built from gates

Four full adders turn two binary words into a four-bit sum and a carry-out. Each stage uses two XOR gates for the sum and an AND-OR network to pass the carry to the next bit.

```lecircuit
/examples/notes/Ripple-carry adder.lecircuit
width: 90%
```

### Follow the carry chain

At each bit, S = A ⊕ B ⊕ Cᵢₙ and Cₒᵤₜ = AB + Cᵢₙ(A ⊕ B). The named nets C1, C2 and C3 join successive stages; C0 is the initial carry and C4 is the final carry-out.

For 0110 + 0011 with C0 = 0, the stages produce S3…S0 = **1001** and C4 = 0: six plus three gives nine. Trace each carry through the drawing to see why the third input matters.

### Word length, delay and overflow

Chaining stages increases word length, but the high bits must wait for lower carries to settle in hardware. Carry-lookahead logic trades extra gates for a shorter carry path.

Carry-out and signed overflow are different: the same 1001 pattern means −7 in four-bit two's complement. Check the number representation before interpreting the result.
