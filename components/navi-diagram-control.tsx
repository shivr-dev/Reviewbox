'use client';
import {createContext,useContext} from 'react';
export const NaviDiagramContext=createContext<{zoom:number;molecule?:'ball-stick'|'spacefill'|'surface'}>({zoom:1});
export const useNaviDiagram=()=>useContext(NaviDiagramContext);
