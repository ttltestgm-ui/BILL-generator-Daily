export interface Employee {
  id: string;
  name: string;
  cardNo: string;
  designation: string;
  defaultTaka: number;
}

export interface BillItem {
  id: string;
  name: string;
  cardNo: string;
  designation: string;
  taka: number;
  remarks: string;
}

export enum BillType {
  TIFFIN = "TIFFIN BILL",
  HOLIDAY = "HOLIDAY BILL",
  DAILY_LABOUR = "DAILY LABOUR BILL",
  NIGHT_ENTERTAINMENT = "NIGHT ENTERTAINMENT BILL"
}