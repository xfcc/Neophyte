/* Verified exchange closures. Outside the evidence year, retain weekdays. */
(function(root){
  const sources={
    CN:'https://www.sse.com.cn/disclosure/announcement/general/c/c_20251222_10802507.shtml',
    HK:'https://www.hkex.com.hk/-/media/HKEX-Market/Services/Circulars-and-Notices/Participant-and-Members-Circulars/SEHK/2025/ce_SEHK_CT_075_2025.pdf',
    US:'https://www.nyse.com/trade/hours-calendars'
  };
  const holidays={
    CN:['01-01','01-02','02-16','02-17','02-18','02-19','02-20','02-23','04-06','05-01','05-04','05-05','06-19','09-25','10-01','10-02','10-05','10-06','10-07'],
    HK:['01-01','02-17','02-18','02-19','04-03','04-06','04-07','05-01','05-25','06-19','07-01','10-01','10-19','12-25'],
    US:['01-01','01-19','02-16','04-03','05-25','06-19','07-03','09-07','11-26','12-25']
  };
  // Mixed layers use common valuation days, not one country's calendar alone.
  const markets={global:['CN','HK','US'],equity:['CN','HK','US'],bond:['CN'],direct_equity_funds:['CN'],direct_bond_funds:['CN'],active_stocks:['HK','US'],advisory:['CN']};
  function closedMarkets(date,layer){
    if(!date.startsWith('2026-'))return [];
    return (markets[layer]??[]).filter(m=>holidays[m].includes(date.slice(5)));
  }
  const api={sources,holidays,markets,closedMarkets};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.NeophyteCalendar=api;
})(typeof window!=='undefined'?window:globalThis);
