
(() => {
  const $ = id => document.getElementById(id);

  let stream = null;
  let detectedValues = [];
  let selectedValue = null;
  let scanning = false;
  let rounds = [];
  let pendingPrediction = null;
  let predictions = [];

  try {
    rounds = JSON.parse(localStorage.getItem('aviatorIQRounds') || '[]');
    predictions = JSON.parse(localStorage.getItem('aviatorIQPredictions') || '[]');
    if (!Array.isArray(rounds)) rounds = [];
    if (!Array.isArray(predictions)) predictions = [];
  } catch {
    rounds = [];
    predictions = [];
  }

  const save = () => {
    localStorage.setItem('aviatorIQRounds', JSON.stringify(rounds));
    localStorage.setItem('aviatorIQPredictions', JSON.stringify(predictions));
    render();
  };

  const format = n => Number(n).toFixed(2) + 'x';

  const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;',
    '"': '&quot;', "'": '&#39;'
  })[c]);

  function frequency(values, test) {
    return values.length
      ? values.filter(test).length / values.length
      : 0;
  }

  // Calculate historical distribution, not a guaranteed prediction.
  function analyse() {
    const values = rounds.map(r => Number(r.value)).filter(Number.isFinite);
    const n = values.length;

    if (!n) {
      return {
        n: 0,
        range: 'Waiting for results',
        rate: 0,
        confidence: 0,
        color: 'grey',
        explanation: 'Record results to begin statistical analysis.'
      };
    }

    const ranges = [
      { label: '1.00x–1.49x', test: x => x >= 1 && x < 1.5 },
      { label: '1.50x–1.99x', test: x => x >= 1.5 && x < 2 },
      { label: '2.00x–4.99x', test: x => x >= 2 && x < 5 },
      { label: '5.00x–9.99x', test: x => x >= 5 && x < 10 },
      { label: '10.00x+', test: x => x >= 10 }
    ];

    const recent = values.slice(0, 30);
    const recentRates = ranges.map(r => frequency(recent, r.test));
    const allRates = ranges.map(r => frequency(values, r.test));

    // Display the most frequent historical band.
    // This is descriptive, not a forecast.
    let best = 0;
    for (let i = 1; i < ranges.length; i++) {
      if (recentRates[i] > recentRates[best]) best = i;
    }

    const count = recent.length;
    const rate = recentRates[best];
    const allRate = allRates[best];

    // Confidence represents sample quantity only.
    const confidence = Math.round(Math.min(100, count / 100 * 100));

    return {
      n,
      range: ranges[best].label,
      rate,
      allRate,
      confidence,
      color: rate >= 0.35 ? 'green' : 'red',
      explanation:
        `${Math.round(rate * 100)}% of the last ${count} recorded rounds ` +
        `fell in this band. Overall sample frequency: ${Math.round(allRate * 100)}%.`
    };
  }

  function predictionPanel() {
    let panel = $('predictionPanel');

    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'predictionPanel';
      panel.style.cssText =
        'margin:15px 0;padding:16px;border-radius:14px;' +
        'background:#14251d;color:#fff;border:1px solid #31523d';

      const anchor = $('history') || $('roundCount')?.parentElement;

      if (anchor?.parentElement) {
        anchor.parentElement.insertBefore(panel, anchor);
      } else {
        document.body.prepend(panel);
      }
    }

    return panel;
  }

  function renderPrediction() {
    const a = analyse();
    const panel = predictionPanel();

    const color = a.color === 'green' ? '#32d879'
      : a.color === 'red' ? '#ff6262' : '#aaa';

    panel.innerHTML = `
      <h3 style="margin:0 0 12px">AVIATOR IQ — STATISTICAL ANALYSIS</h3>
      <div style="font-size:12px;color:#b9c8be">MOST FREQUENT HISTORICAL RANGE</div>
      <div style="font-size:25px;font-weight:bold;color:${color};margin:8px 0">
        ${escapeHTML(a.range)}
      </div>
      <div style="margin:8px 0">
        Recent sample frequency:
        <b>${Math.round(a.rate * 100)}%</b>
      </div>
      <div style="margin:8px 0">
        Sample size: <b>${a.n}</b> rounds
      </div>
      <div style="margin:8px 0">
        Data quantity indicator: <b>${a.confidence}%</b>
      </div>
      <p style="font-size:12px;color:#bdc9c1">${escapeHTML(a.explanation)}</p>
      <p style="font-size:11px;color:#f4c77b">
        This is historical frequency, NOT a reliable next-round prediction.
        Each new round may produce any multiplier.
      </p>
      <button id="recordEstimate" style="padding:10px 14px;border:0;
        border-radius:8px;background:#267a4b;color:white">
        Record this estimate for comparison
      </button>
      <div id="estimateStatus" style="font-size:12px;margin-top:8px"></div>
      <hr style="border-color:#34503e;margin:14px 0">
      <b>Estimate performance</b>
      <div id="estimatePerformance" style="margin-top:8px"></div>
    `;

    $('recordEstimate').addEventListener('click', () => {
      if (pendingPrediction) {
        $('estimateStatus').textContent =
          'An estimate is already waiting for the next recorded result.';
        return;
      }

      pendingPrediction = {
        range: a.range,
        rate: a.rate,
        createdAt: new Date().toISOString(),
        afterRoundCount: rounds.length
      };

      $('estimateStatus').textContent =
        'Estimate saved. Record the next actual round to compare it.';
      renderPrediction();
    });

    const completed = predictions.filter(p => p.actual !== undefined);
    const correct = completed.filter(p => p.correct).length;

    $('estimatePerformance').textContent = completed.length
      ? `${correct} of ${completed.length} comparisons matched the recorded historical band (${Math.round(correct / completed.length * 100)}%).`
      : 'No completed comparisons yet.';
  }

  function render() {
    const vals = rounds.map(r => Number(r.value));
    const n = vals.length;

    if ($('roundCount')) $('roundCount').textContent = n;

    if ($('average')) {
      $('average').textContent = n
        ? (vals.reduce((a, b) => a + b, 0) / n).toFixed(2) + 'x'
        : '—';
    }

    if ($('over2')) {
      $('over2').textContent = n
        ? (frequency(vals, x => x >= 2) * 100).toFixed(1) + '%'
        : '—';
    }

    if ($('over10')) {
      $('over10').textContent = n
        ? (frequency(vals, x => x >= 10) * 100).toFixed(1) + '%'
        : '—';
    }

    if ($('history')) {
      $('history').innerHTML = rounds.slice(0, 160).map(r => {
        const value = Number(r.value);
        const cls = value < 2 ? 'low' : value < 10 ? 'mid' : 'high';

        return `<span class="chip ${cls}" title="${escapeHTML(r.time || '')}">
          ${format(value)}
        </span>`;
      }).join('');
    }

    if ($('empty')) $('empty').style.display = n ? 'none' : 'block';
    if ($('dataStatus')) {
      $('dataStatus').textContent = n >= 100 ? '100+ rounds'
        : n >= 30 ? 'Building sample' : n + ' rounds';
    }

    if ($('probability')) {
      const bands = [
        ['Below 1.50x', x => x < 1.5],
        ['1.50x–1.99x', x => x >= 1.5 && x < 2],
        ['2.00x–4.99x', x => x >= 2 && x < 5],
        ['5.00x–9.99x', x => x >= 5 && x < 10],
        ['10.00x or higher', x => x >= 10]
      ];

      $('probability').innerHTML = n
        ? bands.map(([label, test]) => {
            const count = vals.filter(test).length;
            return `<div style="display:flex;justify-content:space-between;
              padding:7px 0;border-bottom:1px solid #26382e">
              <span>${label}</span>
              <b>${(count / n * 100).toFixed(1)}% (${count}/${n})</b>
            </div>`;
          }).join('')
        : 'Add results to calculate historical frequencies.';
    }

    renderPrediction();
  }

  function addRound(value, source = 'manual') {
    const n = Number(String(value).replace(',', '.'));

    if (!Number.isFinite(n) || n < 1 || n > 1000000) {
      alert('Enter a valid multiplier of 1.00x or higher.');
      return;
    }

    const actual = Number(n.toFixed(2));

    // Compare the new actual result with the pending estimate.
    if (pendingPrediction &&
        rounds.length >= pendingPrediction.afterRoundCount) {
      const range = pendingPrediction.range;

      const tests = {
        '1.00x–1.49x': x => x >= 1 && x < 1.5,
        '1.50x–1.99x': x => x >= 1.5 && x < 2,
        '2.00x–4.99x': x => x >= 2 && x < 5,
        '5.00x–9.99x': x => x >= 5 && x < 10,
        '10.00x+': x => x >= 10
      };

      predictions.unshift({
        ...pendingPrediction,
        actual,
        correct: Boolean(tests[range]?.(actual)),
        completedAt: new Date().toISOString()
      });

      pendingPrediction = null;
    }

    rounds.unshift({
      value: actual,
      time: new Date().toISOString(),
      source
    });

    rounds = rounds.slice(0, 5000);
    predictions = predictions.slice(0, 500);

    save();
  }

  // Camera controls
  if ($('startBtn')) {
    $('startBtn').addEventListener('click', async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        if ($('cameraStatus')) {
          $('cameraStatus').textContent =
            'Camera unavailable. Open the website using HTTPS.';
        }
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false
        });

        $('video').srcObject = stream;
        $('video').hidden = false;
        $('placeholder').hidden = true;
        $('scanBtn').disabled = false;
        $('stopBtn').disabled = false;
        $('startBtn').disabled = true;

        if ($('cameraStatus')) {
          $('cameraStatus').textContent = 'Camera connected.';
        }
      } catch (e) {
        if ($('cameraStatus')) {
          $('cameraStatus').textContent = 'Camera error: ' + e.message;
        }
      }
    });
  }

  if ($('stopBtn')) {
    $('stopBtn').addEventListener('click', () => {
      if (stream) stream.getTracks().forEach(t => t.stop());
      stream = null;

      $('video').srcObject = null;
      $('video').hidden = true;
      $('placeholder').hidden = false;
      $('scanBtn').disabled = true;
      $('stopBtn').disabled = true;
      $('startBtn').disabled = false;

      if ($('cameraStatus')) $('cameraStatus').textContent = 'Camera stopped.';
    });
  }

  // OCR scanning
  if ($('scanBtn')) {
    $('scanBtn').addEventListener('click', async () => {
      if (scanning || !stream) return;

      if (typeof Tesseract === 'undefined') {
        $('ocrStatus').textContent = 'OCR library did not load.';
        return;
      }

      scanning = true;
      $('scanBtn').disabled = true;
      $('ocrStatus').textContent = 'Scanning…';

      try {
        const video = $('video');
        const canvas = $('capture');

        if (!video.videoWidth) throw new Error('Camera is not ready.');

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);

        const result = await Tesseract.recognize(canvas, 'eng', {
          logger: m => {
            if (m.status === 'recognizing text') {
              $('ocrStatus').textContent =
                'Reading screen: ' + Math.round(m.progress * 100) + '%';
            }
          }
        });

        const matches = [...(result.data.text || '').matchAll(
          /(?:^|[^0-9])([1-9]\d{0,4}[.,]\d{1,2})\s*[xX](?=$|[^a-zA-Z])/gm
        )];

        detectedValues = [...new Set(matches.map(m =>
          Number(m[1].replace(',', '.'))
        ).filter(n => Number.isFinite(n) && n >= 1))];

        selectedValue = null;
        $('detected').innerHTML = '';
        $('saveDetected').disabled = true;

        if (!detectedValues.length) {
          $('ocrStatus').textContent = 'No multiplier found. Try again or enter manually.';
        } else {
          $('ocrStatus').textContent = 'Select the correct new result:';

          detectedValues.forEach(n => {
            const b = document.createElement('button');
            b.className = 'secondary';
            b.textContent = format(n);

            b.addEventListener('click', () => {
              selectedValue = n;
              [...$('detected').children].forEach(
                el => el.style.outline = 'none'
              );
              b.style.outline = '2px solid #39d879';
              $('saveDetected').disabled = false;
            });

            $('detected').appendChild(b);
          });
        }
      } catch (e) {
        $('ocrStatus').textContent = 'Scan failed: ' + e.message;
      } finally {
        scanning = false;
        $('scanBtn').disabled = false;
      }
    });
  }

  if ($('saveDetected')) {
    $('saveDetected').addEventListener('click', () => {
      if (selectedValue === null) return;
      addRound(selectedValue, 'camera OCR');
      $('ocrStatus').textContent = 'Result saved: ' + format(selectedValue);
      detectedValues = [];
      selectedValue = null;
      $('detected').innerHTML = '';
      $('saveDetected').disabled = true;
    });
  }

  if ($('clearDetected')) {
    $('clearDetected').addEventListener('click', () => {
      detectedValues = [];
      selectedValue = null;
      $('detected').innerHTML = '';
      $('saveDetected').disabled = true;
      $('ocrStatus').textContent = 'Scan cleared.';
    });
  }

  if ($('addManual')) {
    $('addManual').addEventListener('click', () => {
      if (!$('manual').value) return;
      addRound($('manual').value, 'manual');
      $('manual').value = '';
    });
  }

  if ($('manual')) {
    $('manual').addEventListener('keydown', e => {
      if (e.key === 'Enter') $('addManual').click();
    });
  }

  if ($('clearAll')) {
    $('clearAll').addEventListener('click', () => {
      if (confirm('Delete all recorded results and estimates?')) {
        rounds = [];
        predictions = [];
        pendingPrediction = null;
        save();
      }
    });
  }

  if ($('exportBtn')) {
    $('exportBtn').addEventListener('click', () => {
      const rows = [
        ['multiplier', 'timestamp', 'source'],
        ...rounds.map(r => [r.value, r.time, r.source])
      ];

      const csv = rows.map(row =>
        row.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')
      ).join('\n');

      const url = URL.createObjectURL(
        new Blob([csv], { type: 'text/csv' })
      );

      const link = document.createElement('a');
      link.href = url;
      link.download = 'aviator-iq-rounds.csv';
      link.click();
      URL.revokeObjectURL(url);
    });
  }

  render();
})();
      
