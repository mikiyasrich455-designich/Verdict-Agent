import styles from './GenLoader.module.css';

const LETTERS = ['G', 'e', 'n', 'e', 'r', 'a', 't', 'i', 'n', 'g'];

export default function GenLoader() {
  return (
    <div className={styles['loader-wrapper']} role="status" aria-label="Generating">
      {LETTERS.map((ch, i) => (
        <span className={styles['loader-letter']} key={i}>
          {ch}
        </span>
      ))}

      <div className={styles.loader}></div>
    </div>
  );
}
