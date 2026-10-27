type Booking = {id:string;fare:number;cancelled?:boolean;reissue?:boolean};
function total(bookings:Booking[]):number {
  return bookings.reduce((sum,row)=>row.cancelled?sum:sum+row.fare,0);
}
module.exports={total};

