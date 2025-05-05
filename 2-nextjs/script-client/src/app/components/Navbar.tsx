'use client';

import React from 'react';
import Link from 'next/link';
import { FiHome, FiBriefcase } from 'react-icons/fi';
import { usePathname } from 'next/navigation';

const Navbar: React.FC = () => {
  const pathname = usePathname();
  
  const isActive = (path: string) => {
    return pathname === path ? 'bg-blue-700' : '';
  };
  
  return (
    <nav className="bg-blue-600 text-white shadow-md">
      <div className="container mx-auto px-4 py-3">
        <div className="flex justify-between items-center">
          <div className="font-bold text-xl">Script Video Generator</div>
          
          <div className="flex space-x-2">
            <Link 
              href="/" 
              className={`flex items-center px-3 py-2 rounded hover:bg-blue-700 transition-colors ${isActive('/')}`}
            >
              <FiHome className="mr-2" />
              Home
            </Link>
            
            <Link 
              href="/jobs" 
              className={`flex items-center px-3 py-2 rounded hover:bg-blue-700 transition-colors ${isActive('/jobs')}`}
            >
              <FiBriefcase className="mr-2" />
              Jobs
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar; 