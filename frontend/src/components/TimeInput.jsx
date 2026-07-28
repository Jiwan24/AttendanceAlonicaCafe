/**
 * TimeInput — Input waktu 24 jam tanpa AM/PM
 * 
 * Menggunakan dua input number (HH dan MM) agar tidak ada kolom AM/PM
 * sama sekali di browser manapun.
 * 
 * Props:
 *   value    — string "HH:MM" atau ""
 *   onChange — dipanggil dengan string "HH:MM"
 *   required — boolean
 *   id       — string (opsional)
 */
export default function TimeInput({ value = '', onChange, required, id }) {
  // Parse jam dan menit dari value "HH:MM"
  const [hh, mm] = value ? value.split(':') : ['', ''];

  function handleHour(e) {
    let h = e.target.value.replace(/\D/g, '').slice(0, 2);
    if (h !== '' && parseInt(h, 10) > 23) h = '23';
    const newVal = h.padStart(2, '0') + ':' + (mm || '00');
    onChange(h === '' ? '' : newVal);
  }

  function handleMinute(e) {
    let m = e.target.value.replace(/\D/g, '').slice(0, 2);
    if (m !== '' && parseInt(m, 10) > 59) m = '59';
    const newVal = (hh || '00') + ':' + m.padStart(2, '0');
    onChange(m === '' ? '' : newVal);
  }

  // Saat blur, pastikan format rapi
  function handleHourBlur(e) {
    const h = e.target.value.replace(/\D/g, '');
    if (h === '') return;
    const newVal = h.padStart(2, '0') + ':' + (mm || '00');
    onChange(newVal);
  }

  function handleMinuteBlur(e) {
    const m = e.target.value.replace(/\D/g, '');
    if (m === '') return;
    const newVal = (hh || '00') + ':' + m.padStart(2, '0');
    onChange(newVal);
  }

  return (
    <div className="time-input" id={id}>
      <input
        className="time-input__field"
        type="number"
        min="0"
        max="23"
        placeholder="HH"
        value={hh ?? ''}
        onChange={handleHour}
        onBlur={handleHourBlur}
        required={required}
        aria-label="Jam"
      />
      <span className="time-input__sep">:</span>
      <input
        className="time-input__field"
        type="number"
        min="0"
        max="59"
        placeholder="MM"
        value={mm ?? ''}
        onChange={handleMinute}
        onBlur={handleMinuteBlur}
        required={required}
        aria-label="Menit"
      />
    </div>
  );
}
