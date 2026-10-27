type Booking = {id:string;fare:number;cancelled?:boolean;reissue?:boolean};
function total(bookings:Booking[]):number {
  const fares:Record<string,number>=Object.create(null);let extra=0;
  for(const row of bookings){if(row.cancelled)continue;if(row.reissue)extra+=row.fare;else fares[row.id]=row.fare;}
  return Object.values(fares).reduce((sum,fare)=>sum+fare,extra);
}
module.exports={total};

