// Drawing shared by frame-based export and the compatibility recorder.
export class FramePainter {
  drawFrame(ctx, w, h, layout, captions, t, watermarkText, showCaptions = true) {
    const v = this.video;
    const vw = v.videoWidth;
    const vh = v.videoHeight;
    const target = w / h;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    // recorte central que llena toda la pantalla vertical
    let sw; let sh; let sx; let sy;
    if (vw / vh > target) { sh = vh; sw = vh * target; sx = (vw - sw) / 2; sy = 0; }
    else { sw = vw; sh = vw / target; sx = 0; sy = (vh - sh) / 2; }

    if (layout === 'fit' && vw / vh > target) {
      // video completo al centro con fondo difuminado
      ctx.save();
      ctx.filter = 'blur(24px) brightness(0.6)';
      ctx.drawImage(v, sx, sy, sw, sh, -40, -40, w + 80, h + 80);
      ctx.restore();
      const dh = w * (vh / vw);
      ctx.drawImage(v, 0, 0, vw, vh, 0, (h - dh) / 2, w, dh);
    } else {
      ctx.drawImage(v, sx, sy, sw, sh, 0, 0, w, h);
    }

    if (showCaptions) this.drawCaption(ctx, w, h, captions, t);
    if (watermarkText) this.drawWatermark(ctx, w, h, watermarkText);
  }

  drawCaption(ctx, w, h, captions, t) {
    const chunk = captions.find((c) => t >= c.start && t < c.end);
    if (!chunk) return;
    const words = chunk.words.map((x) => x.text.toUpperCase());
    let size = Math.round(Math.min(w, h) * 0.085);
    const family = '"Arial Black", Impact, "Helvetica Neue", Arial, sans-serif';
    const maxWidth = w * 0.9;
    let total;
    do {
      ctx.font = `900 ${size}px ${family}`;
      total = ctx.measureText(words.join(' ')).width;
      if (total > maxWidth) size -= 2;
    } while (total > maxWidth && size > 20);

    const space = ctx.measureText(' ').width;
    let x = (w - total) / 2;
    const y = h * 0.68;
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(4, size * 0.2);
    ctx.strokeStyle = '#000';
    words.forEach((word, k) => {
      const active = t >= chunk.words[k].start && t < chunk.words[k].end + 0.05;
      ctx.strokeText(word, x, y);
      ctx.fillStyle = active ? '#FFD400' : '#FFFFFF';
      ctx.fillText(word, x, y);
      x += ctx.measureText(word).width + space;
    });
  }

  drawWatermark(ctx, w, h, text) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.font = `700 ${Math.round(Math.min(w, h) * 0.04)}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 4;
    ctx.strokeText(text, w / 2, h * 0.06);
    ctx.fillText(text, w / 2, h * 0.06);
    ctx.restore();
  }


  drawSample(ctx, sample, w, h, layout, captions, t, watermarkText, showCaptions) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    if (layout === 'fit' && sample.displayWidth / sample.displayHeight > w / h) {
      // Blur a smaller surface, then enlarge it. The foreground keeps full resolution.
      const bw = Math.ceil(w / 4), bh = Math.ceil(h / 4);
      if (!this.background || this.background.width !== bw || this.background.height !== bh) {
        this.background = new OffscreenCanvas(bw, bh);
        this.backgroundContext = this.background.getContext('2d', { alpha: false });
      }
      this.backgroundContext.filter = 'none';
      this.backgroundContext.fillStyle = '#000';
      this.backgroundContext.fillRect(0, 0, bw, bh);
      this.backgroundContext.filter = 'blur(6px) brightness(0.6)';
      sample.drawWithFit(this.backgroundContext, { fit: 'cover' });
      ctx.drawImage(this.background, -10, -10, w + 20, h + 20);
      sample.drawWithFit(ctx, { fit: 'contain' });
    } else {
      sample.drawWithFit(ctx, { fit: 'cover' });
    }
    if (showCaptions) this.drawCaption(ctx, w, h, captions, t);
    if (watermarkText) this.drawWatermark(ctx, w, h, watermarkText);
  }
}
