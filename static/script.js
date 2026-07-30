window.onerror = function(message, source, lineno, colno, error) {
    document.getElementById('currentPrice').innerText = 'CRASH';
    document.getElementById('priceChange').innerText = message;
};
window.addEventListener('unhandledrejection', function(event) {
    document.getElementById('currentPrice').innerText = 'PROMISE CRASH';
    document.getElementById('priceChange').innerText = event.reason;
});

let chart;
let candlestickSeries;
let volumeSeries;
let smaSeries;

const chartOptions = {
    layout: {
        background: { type: 'solid', color: 'transparent' },
        textColor: '#94a3b8',
    },
    grid: {
        vertLines: { color: 'rgba(30, 41, 59, 0.5)' },
        horzLines: { color: 'rgba(30, 41, 59, 0.5)' },
    },
    crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
    },
    rightPriceScale: {
        borderColor: 'rgba(30, 41, 59, 0.8)',
    },
    timeScale: {
        borderColor: 'rgba(30, 41, 59, 0.8)',
        timeVisible: true,
    },
};

function initChart() {
    const container = document.getElementById('tvchart');
    
    // Ensure container has dimensions
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 500;
    
    chart = LightweightCharts.createChart(container, {
        ...chartOptions,
        width: width,
        height: height
    });

    candlestickSeries = chart.addCandlestickSeries({
        upColor: '#10b981',
        downColor: '#ef4444',
        borderVisible: false,
        wickUpColor: '#10b981',
        wickDownColor: '#ef4444',
    });

    volumeSeries = chart.addHistogramSeries({
        color: '#26a69a',
        priceFormat: { type: 'volume' },
        priceScaleId: '', // set as an overlay by setting a blank priceScaleId
    });
    
    // Set scale for volume
    volumeSeries.priceScale().applyOptions({
        scaleMargins: {
            top: 0.8, // highest point of the series will be at 80% of the chart
            bottom: 0,
        },
    });

    smaSeries = chart.addLineSeries({
        color: 'rgba(59, 130, 246, 0.8)',
        lineWidth: 2,
        crosshairMarkerVisible: false,
        lastValueVisible: false,
        priceLineVisible: false,
    });

    // Handle resize
    window.addEventListener('resize', () => {
        chart.resize(container.clientWidth || 800, container.clientHeight || 500);
    });
}

function calculateSMA(data, period = 7) {
    const sma = [];
    for (let i = 0; i < data.length; i++) {
        if (i < period - 1) {
            continue; // Not enough data points
        }
        let sum = 0;
        for (let j = 0; j < period; j++) {
            sum += data[i - j].close;
        }
        sma.push({ time: data[i].time, value: sum / period });
    }
    return sma;
}

function formatTime(t) {
    if (!t) return t;
    if (typeof t === 'string' && t.includes('/')) {
        const p = t.split('/');
        if (p.length === 3) {
            return `${p[2]}-${p[0].padStart(2, '0')}-${p[1].padStart(2, '0')}`;
        }
    }
    return t;
}

async function fetchData(asset, limit) {
    const overlay = document.getElementById('loadingOverlay');
    overlay.classList.add('active');

    try {
        const response = await fetch(`/api/data?asset=${asset}&limit=${limit}`);
        if (!response.ok) throw new Error('Data fetch failed');
        const data = await response.json();
        
        if (data && data.length > 0) {
            // Format data for lightweight-charts
            const cdata = data.map(d => ({
                time: formatTime(d.time),
                open: d.open,
                high: d.high,
                low: d.low,
                close: d.close
            }));
            
            const vdata = data.map(d => ({
                time: formatTime(d.time),
                value: d.value,
                color: d.close >= d.open ? 'rgba(16, 185, 129, 0.5)' : 'rgba(239, 68, 68, 0.5)'
            }));

            candlestickSeries.setData(cdata);
            volumeSeries.setData(vdata);
            
            const smaData = calculateSMA(cdata, 7); // 7-day SMA
            smaSeries.setData(smaData);
            
            updateStats(cdata);
            
            chart.timeScale().fitContent();
        }
    } catch (error) {
        console.error("Error loading data:", error);
        document.getElementById('currentPrice').innerText = 'ERROR';
        document.getElementById('priceChange').innerText = error.message;
    } finally {
        overlay.classList.remove('active');
    }
}

async function fetchPrediction(asset, model) {
    const priceEl = document.getElementById('predictedPrice');
    priceEl.innerText = 'Loading...';
    
    try {
        const response = await fetch(`/api/predict?asset=${asset}&model=${model}`);
        if (!response.ok) throw new Error('Prediction not available');
        const data = await response.json();
        
        const formatPrice = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
        
        if (data.predicted_price) {
            priceEl.innerText = formatPrice(data.predicted_price);
        } else {
            priceEl.innerText = '--';
        }
    } catch (error) {
        console.error("Error loading prediction:", error);
        priceEl.innerText = 'N/A';
    }
}

function updateStats(data) {
    if (data.length < 2) return;
    
    const last = data[data.length - 1];
    const prev = data[data.length - 2];
    
    const priceEl = document.getElementById('currentPrice');
    const changeEl = document.getElementById('priceChange');
    const highEl = document.getElementById('highPrice');
    const lowEl = document.getElementById('lowPrice');
    
    // Formatters
    const formatPrice = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
    
    priceEl.innerText = formatPrice(last.close);
    highEl.innerText = formatPrice(last.high);
    lowEl.innerText = formatPrice(last.low);
    
    const change = last.close - prev.close;
    const changePct = (change / prev.close) * 100;
    
    const sign = change >= 0 ? '+' : '';
    changeEl.innerText = `${sign}${formatPrice(change)} (${sign}${changePct.toFixed(2)}%)`;
    
    if (change >= 0) {
        changeEl.className = 'stat-value up';
        priceEl.className = 'stat-value up';
    } else {
        changeEl.className = 'stat-value down';
        priceEl.className = 'stat-value down';
    }
}

async function fetchSentiment(asset) {
    const cardEl = document.getElementById('sentimentCardValue');
    const labelEl = document.getElementById('sentimentLabel');
    const scoreEl = document.getElementById('sentimentScore');
    const headlineEl = document.getElementById('headlineText');
    const signalEl = document.getElementById('signalBadge');
    
    try {
        const response = await fetch(`/api/sentiment?asset=${asset}`);
        if (!response.ok) throw new Error('Sentiment fetch failed');
        const data = await response.json();
        
        labelEl.innerText = data.sentiment;
        scoreEl.innerText = `(${data.score >= 0 ? '+' : ''}${data.score.toFixed(2)})`;
        headlineEl.innerText = data.headline;
        signalEl.innerText = data.signal;
        
        // Classes
        const sentimentType = data.sentiment.toLowerCase();
        cardEl.className = `sentiment-pill ${sentimentType}`;
        
        const signalType = data.signal.toLowerCase();
        signalEl.className = `signal-badge ${signalType}`;
    } catch (error) {
        console.error("Error loading sentiment:", error);
        labelEl.innerText = "N/A";
        scoreEl.innerText = "--";
    }
}

async function handleWordPrediction() {
    const inputEl = document.getElementById('seedInput');
    const seedSpan = document.getElementById('seedSpan');
    const genWordsSpan = document.getElementById('predictedWordsSpan');
    const btn = document.getElementById('predictWordsBtn');
    
    const seed = inputEl.value.trim();
    if (!seed) return;
    
    btn.disabled = true;
    btn.innerText = "Predicting... ✨";
    genWordsSpan.innerText = " predicting next words...";
    
    try {
        const response = await fetch('/api/predict_words', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ seed_text: seed, num_words: 5 })
        });
        
        if (!response.ok) throw new Error('Prediction request failed');
        const data = await response.json();
        
        seedSpan.innerText = data.seed_text;
        genWordsSpan.innerText = " " + data.predicted_words;
    } catch (error) {
        console.error("Error predicting next words:", error);
        genWordsSpan.innerText = " (Unable to predict next words)";
    } finally {
        btn.disabled = false;
        btn.innerText = "Predict Next 5 Words ✨";
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initChart();
    
    const assetSelect = document.getElementById('assetSelect');
    const limitSelect = document.getElementById('limitSelect');
    const modelSelect = document.getElementById('modelSelect');
    const predictWordsBtn = document.getElementById('predictWordsBtn');
    const seedInput = document.getElementById('seedInput');
    
    const loadData = () => {
        fetchData(assetSelect.value, limitSelect.value);
        fetchPrediction(assetSelect.value, modelSelect.value);
        fetchSentiment(assetSelect.value);
    };
    
    assetSelect.addEventListener('change', loadData);
    limitSelect.addEventListener('change', loadData);
    modelSelect.addEventListener('change', () => {
        fetchPrediction(assetSelect.value, modelSelect.value);
    });
    
    if (predictWordsBtn) {
        predictWordsBtn.addEventListener('click', handleWordPrediction);
    }
    if (seedInput) {
        seedInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleWordPrediction();
        });
    }
    
    // Initial load
    loadData();
});
