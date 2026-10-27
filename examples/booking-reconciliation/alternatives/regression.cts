type Booking = {id:string;fare:number;cancelled?:boolean;reissue?:boolean};
function total(bookings:Booking[]):number {
  // Wrong: duplicate Booking IDs inflate totals.
  return bookings.filter(row=>!row.cancelled).reduce((sum,row)=>sum+row.fare,0);
}
module.exports={total};

