---
cssclasses: [circuit-study-note]
---
*Analog electronics · Lab notes 07*

## Conditioning a sensor signal

A 200 mV, 1 kHz sensor signal is amplified, filtered and compared with a reference; the comparator switches an LED through an NPN transistor. Named nets follow the signal: VIN → AMP → FILT → CMP.

```lecircuit
/examples/notes/Sensor signal chain.lecircuit
width: 90%
```

### Hand calculations

The gain is 1 + 100 kΩ / 10 kΩ = **11**, so AMP should reach 2.2 V peak. The inverting low-pass has unity passband gain and f<sub>c</sub> = 1 / (2π · 10 kΩ · 4.7 nF) ≈ 3.39 kHz, which is −0.36 dB at 1 kHz. The divider sets V<sub>ref</sub> = 12 V · 10 kΩ / 110 kΩ ≈ 1.09 V.

### Simulated results

| Quantity | Expected | Simulated |
| --- | --- | --- |
| AMP peak | 2.20 V | 2.20 V |
| FILT peak | 2.11 V | 2.11 V |
| Comparator duty | 32.7 % | 32.8 % |
| LED current | ≈ 9.9 mA | 9.91 mA |

Next lab: add hysteresis so noise near V<sub>ref</sub> cannot make the LED chatter.
