type Booking = {id:string;fare:number;cancelled?:boolean;reissue?:boolean};
function total(bookings:Booking[]):number {
  // Baseline: latest live record per Booking ID, with reissue charged separately.
  const latest=new Map<string,number>();let reissues=0;
  for(const booking of bookings){if(booking.cancelled)continue;if(booking.reissue)reissues+=booking.fare;else latest.set(booking.id,booking.fare);}
  return [...latest.values()].reduce((a,b)=>a+b,0)+reissues;
}
module.exports={total};

