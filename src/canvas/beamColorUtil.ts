export function wavelengthToHex(wavelengthNm: number): string {
  // Approximate mapping of wavelength to RGB hex color
  let r = 0, g = 0, b = 0;
  
  if (wavelengthNm >= 380 && wavelengthNm < 440) {
    r = -(wavelengthNm - 440) / (440 - 380);
    g = 0;
    b = 1;
  } else if (wavelengthNm >= 440 && wavelengthNm < 490) {
    r = 0;
    g = (wavelengthNm - 440) / (490 - 440);
    b = 1;
  } else if (wavelengthNm >= 490 && wavelengthNm < 510) {
    r = 0;
    g = 1;
    b = -(wavelengthNm - 510) / (510 - 490);
  } else if (wavelengthNm >= 510 && wavelengthNm < 580) {
    r = (wavelengthNm - 510) / (580 - 510);
    g = 1;
    b = 0;
  } else if (wavelengthNm >= 580 && wavelengthNm < 645) {
    r = 1;
    g = -(wavelengthNm - 645) / (645 - 580);
    b = 0;
  } else if (wavelengthNm >= 645 && wavelengthNm <= 780) {
    r = 1;
    g = 0;
    b = 0;
  } else if (wavelengthNm > 780) {
    // IR region: make it a dim red
    r = 0.5;
    g = 0;
    b = 0;
  } else {
    // UV region: make it a dim violet
    r = 0.5;
    g = 0;
    b = 0.5;
  }
  
  // Intensity falls off at the limits of vision
  let intensity = 1;
  if (wavelengthNm > 700) {
    intensity = 0.3 + 0.7 * (780 - wavelengthNm) / (780 - 700);
  } else if (wavelengthNm < 420) {
    intensity = 0.3 + 0.7 * (wavelengthNm - 380) / (420 - 380);
  }
  
  intensity = Math.max(0.1, intensity);
  
  const toHex = (c: number) => {
    const hex = Math.round(c * intensity * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
