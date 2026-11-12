---
cssclasses: [circuit-study-note]
---
*Analog electronics · Lab notes 07*

## From light to a threshold output

A photodiode front end feeds two RC filter sections, a non-inverting amplifier and a comparator. Named nets follow the signal: SENSOR → FILTERED → ADC_IN → ALERT.

```lecircuit
/examples/notes/Filter and amplifier.lecircuit
width: 90%
```

### Choosing the filter and gain

Each isolated 10 kΩ / 10 nF section has a corner frequency of about 1.59 kHz. The unbuffered stages load each other, so their combined response needs a separate calculation.

The feedback network sets Aᵥ = 1 + 90 kΩ / 10 kΩ = **10**. The comparator compares ADC_IN with the divider's nominal 1.65 V reference; its output has a pull-up to 3.3 V.

### Before the next lab

Check photodiode bias, the amplifier's input/output range, comparator output type and ADC loading. Noise near the threshold may need hysteresis; the present circuit has none. Compare measured response with the RC estimate.
