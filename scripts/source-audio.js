(() => {
  const qualifiesForHiResBadge = (sourceAudio) => {
    const sampleRateHz = Number(sourceAudio?.sampleRateHz);
    const bitDepth = Number(sourceAudio?.bitDepth);
    return Number.isInteger(sampleRateHz)
      && sampleRateHz >= 48000
      && Number.isInteger(bitDepth)
      && bitDepth >= 24;
  };

  globalThis.SonuviSourceAudio = Object.freeze({ qualifiesForHiResBadge });
})();
