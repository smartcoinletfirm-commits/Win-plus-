(() => {
  const $ = id => document.getElementById(id);

  let stream = null;
  let detectedValues = [];
  let selectedValue = null;
  let scanning = false;
  let rounds = [];

  // Load saved rounds
  try {
    rounds = JSON.parse(
      localStorage.getItem('aviatorIQRounds') || '[]'
    );

    if (!Array.isArray(rounds)) rounds = [];
  } catch (e) {
    rounds = [];
  }

  function persist() {
    localStorage.setItem(
      'aviatorIQRounds',
      JSON.stringify(rounds)
    );
    render();
  }

  function format(n) {
    return Number(n).toFixed(2) + 'x';
  }

  function band(n) {
    return n < 2 ? 'low' : n < 10 ? 'mid' : 'high';
  }

  function addRound(value, source = 'manual') {
    const n = Number(value);

    if (!Number.isFinite(n) || n < 1 || n > 1000000) {
      alert('Enter a valid multiplier of 1.00x or higher.');
      return;
    }

    rounds.unshift({
      value: Number(n.toFixed(2)),
      time: new Date().toISOString(),
      source
    });

    if (rounds.length > 5000) {
      rounds = rounds.slice(0, 5000);
    }

    persist();
  }

  function pct(count, total) {
    return total ? (100 * count / total).toFixed(1) + '%' : '—';
  }

  // Update dashboard
  function render() {
    const vals = rounds.map(r => r.value);
    const n = vals.length;

    $('roundCount').textContent = n;

    $('average').textContent = n
      ? (vals.reduce((a, b) => a + b, 0) / n).toFixed(2) + 'x'
      : '—';

    $('over2').textContent = n
      ? pct(vals.filter(x => x >= 2).length, n)
      : '—';

    $('over10').textContent = n
      ? pct(vals.filter(x => x >= 10).length, n)
      : '—';

    $('history').innerHTML = rounds
      .slice(0, 160)
      .map(r => `
        <span class="chip ${band(r.value)}"
          title="${new Date(r.time).toLocaleString()}">
          ${format(r.value)}
        </span>
      `).join('');

    $('empty').style.display = n ? 'none' : 'block';

    $('dataStatus').textContent =
      n >= 100 ? '100+ rounds' :
      n >= 30 ? 'Building sample' :
      n + ' rounds';

    $('probability').innerHTML = n
      ? [
          ['Below 1.50x', vals.filter(x => x < 1.5).length],
          ['1.50x–1.99x', vals.filter(x => x >= 1.5 && x < 2).length],
          ['2.00x–4.99x', vals.filter(x => x >= 2 && x < 5).length],
          ['5.00x–9.99x', vals.filter(x => x >= 5 && x < 10).length],
          ['10.00x or higher', vals.filter(x => x >= 10).length]
        ].map(([label, count]) => `
          <div style="display:flex;justify-content:space-between;
            padding:7px 0;border-bottom:1px solid #26382e">
            <span>${label}</span>
            <b>${pct(count, n)}
              <span class="muted">(${count}/${n})</span>
            </b>
          </div>
        `).join('') +
        `<p class="muted">
          Sample size: ${n} rounds.
          Historical frequencies do not guarantee future outcomes.
        </p>`
      : 'Add at least one result to calculate sample frequencies.';
  }

  // Start camera
  $('startBtn').addEventListener('click', async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      $('cameraStatus').textContent =
        'Camera unavailable. Open this site using HTTPS.';
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

      $('cameraStatus').textContent =
        'Camera connected. Frame the Aviator result clearly.';
    } catch (e) {
      $('cameraStatus').textContent =
        'Camera could not start: ' + e.message;
    }
  });

  // Stop camera
  $('stopBtn').addEventListener('click', () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }

    stream = null;
    $('video').srcObject = null;
    $('video').hidden = true;
    $('placeholder').hidden = false;

    $('scanBtn').disabled = true;
    $('stopBtn').disabled = true;
    $('startBtn').disabled = false;

    $('cameraStatus').textContent = 'Camera stopped.';
  });

  // Scan camera frame using OCR
  $('scanBtn').addEventListener('click', async () => {
    if (scanning || !stream) return;

    if (typeof Tesseract === 'undefined') {
      $('ocrStatus').textContent =
        'OCR library not loaded. Check your internet connection.';
      return;
    }

    scanning = true;
    $('scanBtn').disabled = true;
    $('ocrStatus').textContent = 'Capturing frame and reading text…';

    try {
      const video = $('video');
      const canvas = $('capture');

      if (!video.videoWidth) {
        throw new Error('Camera is not ready yet.');
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const context = canvas.getContext('2d');
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const result = await Tesseract.recognize(
        canvas,
        'eng',
        {
          logger: message => {
            if (message.status === 'recognizing text') {
              $('ocrStatus').textContent =
                'Reading screen… ' +
                Math.round((message.progress || 0) * 100) + '%';
            }
          }
        }
      );

      const text = result.data.text || '';

      const matches = [
        ...text.matchAll(
          /(?:^|[^0-9])([1-9]\d{0,4}[.,]\d{1,2})\s*[xX](?=$|[^a-zA-Z])/gm
        )
      ];

      detectedValues = [
        ...new Set(
          matches
            .map(m => Number(m[1].replace(',', '.')))
            .filter(n => Number.isFinite(n) && n >= 1)
            .map(n => Number(n.toFixed(2)))
        )
      ];

      selectedValue = null;
      $('detected').innerHTML = '';
      $('saveDetected').disabled = true;

      if (!detectedValues.length) {
        $('ocrStatus').textContent =
          'No clear multiplier found. Improve lighting or enter it manually.';
      } else {
        $('ocrStatus').textContent =
          'Possible values found. Select the correct new round result:';

        detectedValues.forEach(n => {
          const button = document.createElement('button');

          button.className = 'secondary';
          button.textContent = format(n);
          button.style.background = '#26372e';

          button.addEventListener('click', () => {
            selectedValue = n;

            [...$('detected').children].forEach(
              item => item.style.outline = 'none'
            );

            button.style.outline = '2px solid #39d879';
            $('saveDetected').disabled = false;
          });

          $('detected').appendChild(button);
        });
      }

    } catch (e) {
      $('ocrStatus').textContent = 'Scan failed: ' + e.message;
    } finally {
      scanning = false;
      $('scanBtn').disabled = false;
    }
  });

  // Save selected OCR result
  $('saveDetected').addEventListener('click', () => {
    if (selectedValue === null) {
      alert('Select one detected multiplier first.');
      return;
    }

    addRound(selectedValue, 'camera OCR');

    $('ocrStatus').textContent =
      'Saved ' + format(selectedValue) + '.';

    detectedValues = [];
    selectedValue = null;
    $('detected').innerHTML = '';
    $('saveDetected').disabled = true;
  });

  // Clear detected values
  $('clearDetected').addEventListener('click', () => {
    detectedValues = [];
    selectedValue = null;

    $('detected').innerHTML = '';
    $('saveDetected').disabled = true;
    $('ocrStatus').textContent = 'Scan cleared.';
  });

  // Manual multiplier entry
  $('addManual').addEventListener('click', () => {
    const value = $('manual').value;

    if (!value) return;

    addRound(value, 'manual');
    $('manual').value = '';
  });

  $('manual').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      $('addManual').click();
    }
  });

  // Clear all saved history
  $('clearAll').addEventListener('click', () => {
    if (confirm('Delete all locally saved rounds? This cannot be undone.')) {
      rounds = [];
      persist();
    }
  });

  // Export history to CSV
  $('exportBtn').addEventListener('click', () => {
    const rows = [
      ['multiplier', 'timestamp', 'source'],
      ...rounds.map(r => [r.value, r.time, r.source])
    ];

    const csv = rows.map(row =>
      row.map(value =>
        '"' + String(value).replace(/"/g, '""') + '"'
      ).join(',')
    ).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = 'aviator-iq-rounds.csv';
    link.click();

    URL.revokeObjectURL(url);
  });

  // Initial dashboard display
  render();

})();
