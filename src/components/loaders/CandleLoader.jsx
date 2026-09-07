import styles from './CandleLoader.module.css';

export default function CandleLoader() {
  return (
    <div className={styles['candle-wrapper']} role="status" aria-label="Loading">
      <div className={styles['candle-chart']}>
        {Array.from({ length: 18 }).map((_, i) => (
          <div className={styles.candle} key={i}></div>
        ))}
      </div>
    </div>
  );
}
