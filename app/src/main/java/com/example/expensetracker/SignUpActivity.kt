package com.example.expensetracker

import android.content.Intent
import androidx.appcompat.app.AppCompatActivity
import android.os.Bundle
import android.text.TextUtils
import android.widget.Button
import android.widget.EditText
import android.widget.Toast

class SignUpActivity : AppCompatActivity() {

    private lateinit var uname : EditText
    private lateinit var pword : EditText
    private lateinit var cpword : EditText
    private lateinit var sbutton : Button
    private lateinit var db : DatabaseHelper

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_sign_up)

        uname = findViewById(R.id.signUpUsername)
        pword = findViewById(R.id.signUpPassword)
        cpword = findViewById(R.id.signUpConfirmPassword)
        sbutton = findViewById(R.id.signup_button)
        db = DatabaseHelper(this)

        sbutton.setOnClickListener{
            val unametext = uname.text.toString()
            val pwordtext = pword.text.toString()
            val cpwordtext = cpword.text.toString()
            val savedata = db.insertUser(unametext, pwordtext)

            if(TextUtils.isEmpty(unametext) || TextUtils.isEmpty(pwordtext) || TextUtils.isEmpty(cpwordtext))
            {
                Toast.makeText(this, "Please enter username and password!", Toast.LENGTH_SHORT).show()
            }
            else{
                if(pwordtext == cpwordtext){
                    if (savedata){
                        Toast.makeText(this, "Signup Successful!", Toast.LENGTH_SHORT).show()
                        val intent = Intent(this, LoginActivity::class.java)
                        startActivity(intent)
                    }
                    else {
                        Toast.makeText(this, "User Already Exist!", Toast.LENGTH_SHORT).show()
                    }

                }else{
                    Toast.makeText(this, "Please match password!", Toast.LENGTH_SHORT).show()
                }
            }

    }
    }

}