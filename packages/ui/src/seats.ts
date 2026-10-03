/** Number of distinct participant visual identities defined in styles.css. */
export const SEAT_COUNT = 6;

export function seatClass(seat: number): string {
  return `px-seat-${((seat % SEAT_COUNT) + SEAT_COUNT) % SEAT_COUNT}`;
}
